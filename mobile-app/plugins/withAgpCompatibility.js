const { withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Fixes Android build failures caused by incompatibilities between:
 *   - Gradle 8.13 (pinned below)
 *   - RNGP 0.81.5 which forces AGP 8.11.0 via composite build
 *   - Legacy React Native library build.gradle patterns
 *
 * Issue 1 — async-storage 2.x:
 *   `configurations { compileClasspath }` at the top of android/build.gradle
 *   conflicts with AGP 8.11.0's own compileClasspath configuration setup,
 *   causing the Android library plugin to register zero variants.
 *
 * Issue 2 — safe-area-context 5.x / screens 4.x:
 *   These modules declare old AGP in their own buildscript classpath.
 *   With Gradle 8.13, loading the old AGP class in a child classloader alongside
 *   the RNGP composite build's AGP 8.11.0 causes a class-loading conflict that
 *   silently aborts variant registration ("No variants exist").
 *   Fix: remove the old AGP classpath from those modules so they inherit 8.11.0.
 *
 * Issue 3 — react-native-screens 4.x (CRITICAL):
 *   Uses `import com.android.Version` as a TOP-LEVEL import statement.
 *   This forces Groovy/Gradle to resolve the class at compile-time (script
 *   compilation), before any plugins are applied. Under RNGP composite build
 *   (no direct AGP classpath), this class may not be resolvable → script fails
 *   to compile → no android {} block → no variants.
 *   Fix: replace the static import with inline class lookup so it degrades
 *   gracefully, OR replace with the hardcoded "8.11.0" string.
 *
 * Issue 4 — datetimepicker 8.x / svg 15.x:
 *   Both modules access com.android.Version.ANDROID_GRADLE_PLUGIN_VERSION inside
 *   their android {} block at configuration time. When AGP is loaded exclusively
 *   via the RNGP composite build (no direct AGP classpath entry in the module's
 *   own buildscript), this class access can fail and abort the android {} block,
 *   leaving no variants.
 *   Fix: replace the dynamic com.android.Version lookup with the hardcoded string
 *   "8.11.0" (matching what RNGP 0.81.5 forces).
 *
 * Issue 5 — react-native-svg 15.x:
 *   Has `classpath("com.android.tools.build:gradle:7.4.2")` inside a
 *   `if (project == rootProject)` conditional block. Same classloader conflict.
 *   Fix: comment out the AGP classpath line.
 */

function withGradleWrapper(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const propsPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'gradle', 'wrapper', 'gradle-wrapper.properties'
      );
      if (fs.existsSync(propsPath)) {
        let contents = fs.readFileSync(propsPath, 'utf8');
        contents = contents.replace(
          /distributionUrl=.*gradle-[\d.]+-bin\.zip/,
          'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.13-bin.zip'
        );
        fs.writeFileSync(propsPath, contents);
        console.log('[withAgpCompatibility] Pinned Gradle wrapper to 8.13');
      }
      return cfg;
    },
  ]);
}

function withRootBuildGradle(config) {
  return withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Inject a TOP-LEVEL ext {} block BEFORE buildscript {} so that
    // rootProject.ext properties are readable by all subproject build.gradle files
    // during the configuration phase. In Gradle 8.x, ext {} inside buildscript {}
    // does NOT set project.ext — only a top-level ext {} block is guaranteed to work.
    if (!contents.includes('compileSdkVersion =')) {
      contents = contents.replace(
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
      console.log('[withAgpCompatibility] Injected top-level ext SDK-version properties (before buildscript)');
    }

    // Pin Kotlin Gradle plugin to 2.1.21 for KSP 2.1.21-2.0.2 compatibility.
    contents = contents.replace(
      /classpath\(['""]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'""]*)?['""]?\)/g,
      "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.21')"
    );

    cfg.modResults.contents = contents;
    return cfg;
  });
}

/**
 * Helper: apply a single patch to a file.
 * Supports both regex and string finds. Uses replaceAll for global replacement.
 */
function applyPatch(filePath, label, find, replace) {
  if (!fs.existsSync(filePath)) {
    console.log(`[withAgpCompatibility] File not found, skipping: ${label}`);
    return;
  }
  const original = fs.readFileSync(filePath, 'utf8');
  let patched;
  if (find instanceof RegExp) {
    // Always use a global regex — re-create with /g if not already global
    const globalRegex = find.flags.includes('g')
      ? find
      : new RegExp(find.source, find.flags + 'g');
    patched = original.replace(globalRegex, replace);
  } else {
    // String find: replace ALL occurrences
    patched = original.split(find).join(replace);
  }
  if (patched !== original) {
    fs.writeFileSync(filePath, patched);
    console.log(`[withAgpCompatibility] Patched: ${label}`);
  } else {
    console.log(`[withAgpCompatibility] Already clean or pattern not found: ${label}`);
  }
}

function withLibraryBuildGradlePatches(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const nodeModulesPath = path.join(
        cfg.modRequest.platformProjectRoot, '..', 'node_modules'
      );

      // ─── 1. @react-native-async-storage/async-storage ───────────────────────
      const asyncStorageGradle = path.join(
        nodeModulesPath,
        '@react-native-async-storage', 'async-storage', 'android', 'build.gradle'
      );

      // Remove the top-level `configurations { compileClasspath }` block
      applyPatch(
        asyncStorageGradle,
        '@react-native-async-storage/async-storage (configurations block)',
        /configurations\s*\{\s*\n\s*compileClasspath\s*\n\s*\}\s*\n+/,
        ''
      );

      // Replace com.android.Version dynamic lookup with hardcoded string
      applyPatch(
        asyncStorageGradle,
        '@react-native-async-storage/async-storage (com.android.Version)',
        /def agpVersion = com\.android\.Version\.ANDROID_GRADLE_PLUGIN_VERSION/,
        'def agpVersion = "8.11.0" // pinned for RNGP 0.81.5'
      );

      // ─── 2. react-native-safe-area-context ──────────────────────────────────
      const safeAreaGradle = path.join(
        nodeModulesPath,
        'react-native-safe-area-context', 'android', 'build.gradle'
      );

      // Remove AGP classpath — use string replace to handle all quote styles
      applyPatch(
        safeAreaGradle,
        'react-native-safe-area-context (AGP classpath)',
        // Matches: classpath("com.android.tools.build:gradle:X.Y.Z")
        //      or: classpath('com.android.tools.build:gradle:X.Y.Z')
        /classpath\(["']com\.android\.tools\.build:gradle:[^"']*["']\)/g,
        '// AGP version provided by RNGP composite build (8.11.0)'
      );

      // ─── 3. react-native-screens ─────────────────────────────────────────────
      const screensGradle = path.join(
        nodeModulesPath,
        'react-native-screens', 'android', 'build.gradle'
      );

      // CRITICAL: react-native-screens uses `import com.android.Version` as a
      // TOP-LEVEL import, which forces class resolution at Groovy script compile
      // time. Replace the static import with a safe inline lookup.
      applyPatch(
        screensGradle,
        'react-native-screens (import com.android.Version)',
        'import com.android.Version\n',
        '// import com.android.Version -- removed for RNGP composite build compatibility\n'
      );

      // Also remove AGP classpath from screens buildscript
      applyPatch(
        screensGradle,
        'react-native-screens (AGP classpath)',
        /classpath\(["']com\.android\.tools\.build:gradle:[^"']*["']\)/g,
        '// AGP version provided by RNGP composite build (8.11.0)'
      );

      // react-native-screens references `Version.ANDROID_GRADLE_PLUGIN_VERSION`
      // without the package prefix (relies on the import). After removing the import,
      // replace any bare `Version.ANDROID_GRADLE_PLUGIN_VERSION` usage with a string.
      applyPatch(
        screensGradle,
        'react-native-screens (Version.ANDROID_GRADLE_PLUGIN_VERSION bare)',
        /\bVersion\.ANDROID_GRADLE_PLUGIN_VERSION\b/g,
        '"8.11.0" /* pinned for RNGP 0.81.5 */'
      );

      // ─── 4. @react-native-community/datetimepicker ──────────────────────────
      const datetimepickerGradle = path.join(
        nodeModulesPath,
        '@react-native-community', 'datetimepicker', 'android', 'build.gradle'
      );

      applyPatch(
        datetimepickerGradle,
        '@react-native-community/datetimepicker (com.android.Version)',
        /def agpVersion = com\.android\.Version\.ANDROID_GRADLE_PLUGIN_VERSION/,
        'def agpVersion = "8.11.0" // pinned for RNGP 0.81.5'
      );

      // ─── 5. react-native-svg ─────────────────────────────────────────────────
      const svgGradle = path.join(
        nodeModulesPath,
        'react-native-svg', 'android', 'build.gradle'
      );

      // Replace com.android.Version dynamic lookup
      applyPatch(
        svgGradle,
        'react-native-svg (com.android.Version)',
        /def agpVersion = com\.android\.Version\.ANDROID_GRADLE_PLUGIN_VERSION/,
        'def agpVersion = "8.11.0" // pinned for RNGP 0.81.5'
      );

      // Remove AGP classpath inside conditional block
      applyPatch(
        svgGradle,
        'react-native-svg (AGP classpath)',
        /classpath\(["']com\.android\.tools\.build:gradle:[^"']*["']\)/g,
        '// AGP version provided by RNGP composite build (8.11.0)'
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
