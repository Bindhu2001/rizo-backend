const { withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Fixes "No variants exist" Gradle build failures caused by AGP classloader
 * conflicts between RNGP 0.81.5 (forces AGP 8.11.0 via composite build) and
 * legacy buildscript{} blocks in RN library build.gradle files.
 *
 * Root cause: When a subproject declares its OWN buildscript{} with an old
 * AGP classpath (e.g. 7.3.1 or 8.2.1), Gradle loads that AGP version into
 * the subproject's buildscript classloader. This conflicts with AGP 8.11.0
 * from the RNGP composite build → `apply plugin: 'com.android.library'` may
 * use the wrong AGP version → android{} block fails → zero variants registered.
 *
 * Fix strategy per library:
 *  - react-native-safe-area-context : remove ENTIRE buildscript{} block +
 *                                     pin com.android.Version in android{}
 *  - react-native-screens           : keep ext{} blocks (used by android{}),
 *                                     remove dependencies{}/repositories{} from
 *                                     buildscript + remove top-level import +
 *                                     pin Version.XXX references
 *  - react-native-svg               : remove ENTIRE buildscript{} (all content
 *                                     is gated on `project == rootProject`) +
 *                                     pin com.android.Version in android{}
 *  - async-storage                  : remove configurations{compileClasspath} +
 *                                     pin com.android.Version in android{}
 *  - datetimepicker                 : pin com.android.Version in android{}
 */

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/** Read a file, apply replacements, write back only if content changed. */
function patchFile(filePath, label, patchFn) {
  if (!fs.existsSync(filePath)) {
    console.log(`[withAgpCompatibility] SKIP (not found): ${label}`);
    return;
  }
  const original = fs.readFileSync(filePath, 'utf8');
  const patched = patchFn(original);
  if (patched !== original) {
    fs.writeFileSync(filePath, patched);
    console.log(`[withAgpCompatibility] Patched: ${label}`);
  } else {
    console.log(`[withAgpCompatibility] Already clean: ${label}`);
  }
}

/**
 * Remove an entire top-level buildscript{} block from Groovy/Kotlin gradle.
 * Uses a simple brace-counter parser — handles nested braces correctly.
 */
function removeBuildscriptBlock(content) {
  const marker = 'buildscript';
  let idx = content.indexOf(marker);
  while (idx !== -1) {
    // Find the opening brace of buildscript { ...
    const openIdx = content.indexOf('{', idx + marker.length);
    if (openIdx === -1) break;

    // Make sure nothing but whitespace/comments between 'buildscript' and '{'
    const between = content.slice(idx + marker.length, openIdx);
    if (/\S/.test(between.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))) {
      // Not a direct buildscript { — skip
      idx = content.indexOf(marker, idx + 1);
      continue;
    }

    // Walk forward counting braces to find the matching close brace
    let depth = 1;
    let i = openIdx + 1;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }

    // i now points one past the closing '}'
    // Remove from the start of 'buildscript' through the closing '}' + trailing newline
    const blockEnd = i;
    // Also consume any trailing whitespace/newline immediately after the block
    let end = blockEnd;
    while (end < content.length && (content[end] === '\r' || content[end] === '\n')) end++;

    content = content.slice(0, idx) + content.slice(end);
    // Don't advance idx — there might be another buildscript (unlikely but safe)
    break;
  }
  return content;
}

/**
 * Remove only the `dependencies { ... }` block that is DIRECTLY inside the
 * first `buildscript { ... }` block (leaves ext{} and repositories{} intact
 * so that ext properties used by android{} are still available).
 */
function removeBuildscriptDependencies(content) {
  const bsStart = content.indexOf('buildscript');
  if (bsStart === -1) return content;
  const bsOpenIdx = content.indexOf('{', bsStart);
  if (bsOpenIdx === -1) return content;

  // Find end of buildscript block
  let depth = 1;
  let i = bsOpenIdx + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  const bsClose = i - 1; // index of closing '}' of buildscript

  // Inside the buildscript block, find 'dependencies {'
  const bsBody = content.slice(bsOpenIdx + 1, bsClose);
  const depMarker = 'dependencies';
  const depRelIdx = bsBody.indexOf(depMarker);
  if (depRelIdx === -1) return content;

  const depOpenRelIdx = bsBody.indexOf('{', depRelIdx + depMarker.length);
  if (depOpenRelIdx === -1) return content;

  // Walk forward to find matching close brace of dependencies{}
  let d = 1;
  let j = depOpenRelIdx + 1;
  while (j < bsBody.length && d > 0) {
    if (bsBody[j] === '{') d++;
    else if (bsBody[j] === '}') d--;
    j++;
  }

  // Remove the dependencies block from bsBody
  let end = j;
  while (end < bsBody.length && (bsBody[end] === '\r' || bsBody[end] === '\n')) end++;

  const newBsBody = bsBody.slice(0, depRelIdx) + bsBody.slice(end);
  return content.slice(0, bsOpenIdx + 1) + newBsBody + content.slice(bsClose);
}

// ---------------------------------------------------------------------------
// Plugin phases
// ---------------------------------------------------------------------------

function withGradleWrapper(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const propsPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'gradle', 'wrapper', 'gradle-wrapper.properties'
      );
      if (fs.existsSync(propsPath)) {
        let c = fs.readFileSync(propsPath, 'utf8');
        c = c.replace(
          /distributionUrl=.*gradle-[\d.]+-bin\.zip/,
          'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.13-bin.zip'
        );
        fs.writeFileSync(propsPath, c);
        console.log('[withAgpCompatibility] Pinned Gradle wrapper → 8.13');
      }
      return cfg;
    },
  ]);
}

function withRootBuildGradle(config) {
  return withProjectBuildGradle(config, (cfg) => {
    let c = cfg.modResults.contents;

    // Inject top-level ext{} with SDK versions before buildscript{}
    if (!c.includes('compileSdkVersion =')) {
      c = c.replace(
        /buildscript\s*\{/,
        [
          'ext {',
          '    buildToolsVersion = "36.0.0"',
          '    minSdkVersion = 24',
          '    compileSdkVersion = 36',
          '    targetSdkVersion = 36',
          '    ndkVersion = "27.1.12297006"',
          '    kotlinVersion = "2.1.21"',
          '}',
          '',
          'buildscript {',
        ].join('\n')
      );
      console.log('[withAgpCompatibility] Injected top-level ext block');
    }

    // Pin Kotlin plugin version
    c = c.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"]*)?['"]\)/g,
      "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.21')"
    );

    cfg.modResults.contents = c;
    return cfg;
  });
}

function withLibraryBuildGradlePatches(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const nm = path.join(cfg.modRequest.platformProjectRoot, '..', 'node_modules');

      // ── 1. @react-native-async-storage/async-storage ──────────────────────
      patchFile(
        path.join(nm, '@react-native-async-storage/async-storage/android/build.gradle'),
        '@react-native-async-storage/async-storage',
        (c) => {
          // Remove configurations { compileClasspath } block
          c = c.replace(/configurations\s*\{\s*\n\s*compileClasspath\s*\n\s*\}\s*\n+/, '');
          // Pin com.android.Version inside android{}
          c = c.replace(
            /def agpVersion = com\.android\.Version\.ANDROID_GRADLE_PLUGIN_VERSION/g,
            'def agpVersion = "8.11.0" // pinned for RNGP 0.81.5'
          );
          return c;
        }
      );

      // ── 2. react-native-safe-area-context ─────────────────────────────────
      patchFile(
        path.join(nm, 'react-native-safe-area-context/android/build.gradle'),
        'react-native-safe-area-context',
        (c) => {
          // Remove ENTIRE buildscript{} block — it contains AGP 7.3.1 classpath
          // which creates a classloader conflict with RNGP's AGP 8.11.0.
          c = removeBuildscriptBlock(c);
          // Pin com.android.Version inside android{}
          c = c.replace(
            /def agpVersion = com\.android\.Version\.ANDROID_GRADLE_PLUGIN_VERSION/g,
            'def agpVersion = "8.11.0" // pinned for RNGP 0.81.5'
          );
          return c;
        }
      );

      // ── 3. react-native-screens ───────────────────────────────────────────
      patchFile(
        path.join(nm, 'react-native-screens/android/build.gradle'),
        'react-native-screens',
        (c) => {
          // Remove top-level `import com.android.Version` (resolved at Groovy
          // compile time, before any plugin applies → classloader failure)
          c = c.replace(/^import com\.android\.Version\r?\n/m, '');

          // Remove ONLY the dependencies{} block inside buildscript{} (keep
          // ext{} blocks that define rnsDefaultXxx / safeExtGet used by android{})
          c = removeBuildscriptDependencies(c);

          // Replace bare `Version.ANDROID_GRADLE_PLUGIN_VERSION` (unqualified,
          // was relying on the now-removed import)
          c = c.replace(
            /\bVersion\.ANDROID_GRADLE_PLUGIN_VERSION\b/g,
            '"8.11.0" /* pinned for RNGP 0.81.5 */'
          );

          return c;
        }
      );

      // ── 4. @react-native-community/datetimepicker ─────────────────────────
      patchFile(
        path.join(nm, '@react-native-community/datetimepicker/android/build.gradle'),
        '@react-native-community/datetimepicker',
        (c) => {
          c = c.replace(
            /def agpVersion = com\.android\.Version\.ANDROID_GRADLE_PLUGIN_VERSION/g,
            'def agpVersion = "8.11.0" // pinned for RNGP 0.81.5'
          );
          return c;
        }
      );

      // ── 5. react-native-svg ───────────────────────────────────────────────
      patchFile(
        path.join(nm, 'react-native-svg/android/build.gradle'),
        'react-native-svg',
        (c) => {
          // Remove ENTIRE buildscript{} block (all content inside is gated on
          // `project == rootProject`, so it's a no-op when used as a subproject
          // but still creates an empty buildscript classpath that overrides root)
          c = removeBuildscriptBlock(c);
          // Pin com.android.Version inside android{}
          c = c.replace(
            /def agpVersion = com\.android\.Version\.ANDROID_GRADLE_PLUGIN_VERSION/g,
            'def agpVersion = "8.11.0" // pinned for RNGP 0.81.5'
          );
          return c;
        }
      );

      return cfg;
    },
  ]);
}

module.exports = function withAgpCompatibility(config) {
  config = withGradleWrapper(config);
  config = withRootBuildGradle(config);
  config = withLibraryBuildGradlePatches(config);
  return config;
};
