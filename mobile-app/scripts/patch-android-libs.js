#!/usr/bin/env node
/**
 * patch-android-libs.js
 *
 * Fixes "No variants exist" Gradle build failures caused by AGP classloader
 * conflicts between RNGP 0.81.5 (forces AGP 8.11.0 via composite build) and
 * legacy buildscript{} blocks in RN library build.gradle files.
 *
 * This script is intentionally standalone (no external deps beyond Node built-ins)
 * so it can safely run as a `postinstall` npm hook on EAS Build servers, where
 * `expo prebuild` is skipped because the android/ directory is already committed.
 *
 * Affected libraries:
 *   - @react-native-async-storage/async-storage
 *   - @react-native-community/datetimepicker
 *   - react-native-safe-area-context
 *   - react-native-screens
 *   - react-native-svg
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function patchFile(filePath, label, patchFn) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-android-libs] SKIP (not found): ${label}`);
    return;
  }
  const original = fs.readFileSync(filePath, 'utf8');
  const patched  = patchFn(original);
  if (patched !== original) {
    fs.writeFileSync(filePath, patched, 'utf8');
    console.log(`[patch-android-libs] ✓ Patched: ${label}`);
  } else {
    console.log(`[patch-android-libs] ✓ Already clean: ${label}`);
  }
}

/**
 * Remove the entire top-level buildscript{} block.
 * Uses a brace-depth counter so nested braces are handled correctly.
 */
function removeBuildscriptBlock(content) {
  const marker  = 'buildscript';
  let   idx     = content.indexOf(marker);

  while (idx !== -1) {
    const openIdx = content.indexOf('{', idx + marker.length);
    if (openIdx === -1) break;

    // Ensure nothing but whitespace/comments sits between 'buildscript' and '{'
    const between = content.slice(idx + marker.length, openIdx);
    if (/\S/.test(between.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))) {
      idx = content.indexOf(marker, idx + 1);
      continue;
    }

    // Walk forward to find the matching closing brace
    let depth = 1;
    let i     = openIdx + 1;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }

    // Consume any trailing newlines after the closing brace
    let end = i;
    while (end < content.length && (content[end] === '\r' || content[end] === '\n')) end++;

    content = content.slice(0, idx) + content.slice(end);
    break;
  }
  return content;
}

/**
 * Remove only the dependencies{} sub-block inside buildscript{}.
 * Preserves ext{} and repositories{} so that ext properties used by
 * android{} (e.g. rnsDefaultTargetSdkVersion, safeExtGet) remain available.
 */
function removeBuildscriptDependencies(content) {
  const bsStart   = content.indexOf('buildscript');
  if (bsStart === -1) return content;
  const bsOpenIdx = content.indexOf('{', bsStart);
  if (bsOpenIdx === -1) return content;

  // Find the end of the buildscript{} block
  let depth = 1;
  let i     = bsOpenIdx + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  const bsClose = i - 1; // index of closing '}' of buildscript{}

  // Find 'dependencies' inside the buildscript body
  const bsBody      = content.slice(bsOpenIdx + 1, bsClose);
  const depMarker   = 'dependencies';
  const depRelIdx   = bsBody.indexOf(depMarker);
  if (depRelIdx === -1) return content;

  const depOpenRelIdx = bsBody.indexOf('{', depRelIdx + depMarker.length);
  if (depOpenRelIdx === -1) return content;

  // Walk forward to find the matching closing brace of dependencies{}
  let d = 1;
  let j = depOpenRelIdx + 1;
  while (j < bsBody.length && d > 0) {
    if (bsBody[j] === '{') d++;
    else if (bsBody[j] === '}') d--;
    j++;
  }

  // Consume trailing newlines
  let end = j;
  while (end < bsBody.length && (bsBody[end] === '\r' || bsBody[end] === '\n')) end++;

  const newBsBody = bsBody.slice(0, depRelIdx) + bsBody.slice(end);
  return content.slice(0, bsOpenIdx + 1) + newBsBody + content.slice(bsClose);
}

// ---------------------------------------------------------------------------
// Locate node_modules (works whether script is called from project root or
// from inside scripts/)
// ---------------------------------------------------------------------------

const projectRoot = path.resolve(__dirname, '..');
const nm          = path.join(projectRoot, 'node_modules');

// ---------------------------------------------------------------------------
// Patches
// ---------------------------------------------------------------------------

console.log('[patch-android-libs] Applying AGP 8.11.0 compatibility patches…');

// ── 1. @react-native-async-storage/async-storage ────────────────────────────
patchFile(
  path.join(nm, '@react-native-async-storage/async-storage/android/build.gradle'),
  '@react-native-async-storage/async-storage',
  (c) => {
    // Remove configurations { compileClasspath } block that causes variant lookup
    // to fail when no compile classpath entries exist.
    c = c.replace(/configurations\s*\{\s*\n\s*compileClasspath\s*\n\s*\}\s*\n+/, '');
    // Pin the AGP version so com.android.Version.ANDROID_GRADLE_PLUGIN_VERSION
    // is not evaluated at buildscript classloader time.
    c = c.replace(
      /def agpVersion = com\.android\.Version\.ANDROID_GRADLE_PLUGIN_VERSION/g,
      'def agpVersion = "8.11.0" // pinned for RNGP 0.81.5'
    );
    return c;
  }
);

// ── 2. react-native-safe-area-context ───────────────────────────────────────
patchFile(
  path.join(nm, 'react-native-safe-area-context/android/build.gradle'),
  'react-native-safe-area-context',
  (c) => {
    // Remove ENTIRE buildscript{} — it pulls in AGP 7.3.1 which conflicts with
    // the AGP 8.11.0 applied by the RNGP composite build.
    c = removeBuildscriptBlock(c);
    c = c.replace(
      /def agpVersion = com\.android\.Version\.ANDROID_GRADLE_PLUGIN_VERSION/g,
      'def agpVersion = "8.11.0" // pinned for RNGP 0.81.5'
    );
    return c;
  }
);

// ── 3. react-native-screens ─────────────────────────────────────────────────
patchFile(
  path.join(nm, 'react-native-screens/android/build.gradle'),
  'react-native-screens',
  (c) => {
    // Remove the top-level `import com.android.Version` — resolved at Groovy
    // compile time, before any plugin is applied → classloader failure.
    c = c.replace(/^import com\.android\.Version\r?\n/m, '');
    // Remove ONLY the dependencies{} inside buildscript{} (keep ext{} blocks
    // that provide rnsDefaultXxx / safeExtGet used by the android{} block).
    c = removeBuildscriptDependencies(c);
    // Replace bare `Version.ANDROID_GRADLE_PLUGIN_VERSION` references
    // (the import that used to bring them in scope is now gone).
    c = c.replace(
      /\bVersion\.ANDROID_GRADLE_PLUGIN_VERSION\b/g,
      '"8.11.0" /* pinned for RNGP 0.81.5 */'
    );
    return c;
  }
);

// ── 4. @react-native-community/datetimepicker ───────────────────────────────
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

// ── 5. react-native-svg ─────────────────────────────────────────────────────
patchFile(
  path.join(nm, 'react-native-svg/android/build.gradle'),
  'react-native-svg',
  (c) => {
    // The entire buildscript{} body is gated on `project == rootProject`, so
    // it is a no-op in subproject context — but still creates an empty buildscript
    // classpath that overrides the root AGP. Remove it entirely.
    c = removeBuildscriptBlock(c);
    c = c.replace(
      /def agpVersion = com\.android\.Version\.ANDROID_GRADLE_PLUGIN_VERSION/g,
      'def agpVersion = "8.11.0" // pinned for RNGP 0.81.5'
    );
    return c;
  }
);

console.log('[patch-android-libs] Done.');
