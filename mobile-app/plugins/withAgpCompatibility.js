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
 *   These modules declare AGP 7.3.1 / 8.2.1 in their own buildscript classpath.
 *   With Gradle 8.13, loading the old AGP class in a child classloader alongside
 *   the RNGP composite build's AGP 8.11.0 causes a class-loading conflict that
 *   silently aborts variant registration ("No variants exist").
 *   Fix: remove the old AGP classpath from those modules so they inherit 8.11.0.
 *
 * Issue 3 — datetimepicker 8.x / svg 15.x:
 *   These modules read compileSdkVersion, targetSdkVersion, minSdkVersion,
 *   and kotlinVersion from rootProject.ext.  Expo SDK 54's generated build.gradle
 *   no longer includes an ext { } block with those values (the expo-root-project
 *   plugin sets compileSdk/minSdk without the "Version" suffix).
 *   When the fallback property lookup fails, a NullPointerException aborts the
 *   android { } block, leaving the module with no registered variants.
 *   Fix: inject an ext { } block into the root buildscript.
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

    // Inject ext properties block inside buildscript so they are available in
    // rootProject.ext before any subproject buildscript block is evaluated.
    if (!contents.includes('compileSdkVersion =')) {
      contents = contents.replace(
        /buildscript\s*\{/,
        [
          'buildscript {',
          '  ext {',
          '    buildToolsVersion = "36.0.0"',
          '    minSdkVersion = 24',
          '    compileSdkVersion = 36',
          '    targetSdkVersion = 36',
          '    ndkVersion = "27.1.12297006"',
          '    kotlinVersion = "2.1.21"',
          '  }',
        ].join('\n')
      );
      console.log('[withAgpCompatibility] Injected ext SDK-version properties into buildscript');
    }

    // Pin Kotlin Gradle plugin to 2.1.21 for KSP 2.1.21-2.0.2 compatibility.
    contents = contents.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"]*)?['"]\)/g,
      "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.21')"
    );

    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withLibraryBuildGradlePatches(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const nodeModulesPath = path.join(
        cfg.modRequest.platformProjectRoot, '..', 'node_modules'
      );

      const patches = [
        {
          // async-storage 2.x: the top-level `configurations { compileClasspath }` block
          // pre-creates a configuration that AGP 8.11.0 also tries to create, causing
          // the library plugin to fail and register no variants.
          label: '@react-native-async-storage/async-storage',
          file: path.join('@react-native-async-storage', 'async-storage', 'android', 'build.gradle'),
          find: /configurations\s*\{\s*\n\s*compileClasspath\s*\n\s*\}\s*\n+/,
          replace: '',
        },
        {
          // safe-area-context 5.x: AGP 7.3.1 in its buildscript classpath.
          // Gradle 8.13 + RNGP AGP 8.11.0 composite build → classloader conflict → no variants.
          label: 'react-native-safe-area-context',
          file: path.join('react-native-safe-area-context', 'android', 'build.gradle'),
          find: /classpath\("com\.android\.tools\.build:gradle:[^"]*"\)/g,
          replace: '// AGP version provided by RNGP composite build (8.11.0)',
        },
        {
          // react-native-screens 4.x: AGP 8.2.1 in its buildscript classpath.
          // Same classloader conflict as safe-area-context above.
          label: 'react-native-screens',
          file: path.join('react-native-screens', 'android', 'build.gradle'),
          find: /classpath\('com\.android\.tools\.build:gradle:[^']*'\)/g,
          replace: '// AGP version provided by RNGP composite build (8.11.0)',
        },
      ];

      for (const patch of patches) {
        const filePath = path.join(nodeModulesPath, patch.file);
        if (!fs.existsSync(filePath)) {
          console.log(`[withAgpCompatibility] File not found, skipping: ${patch.label}`);
          continue;
        }
        const original = fs.readFileSync(filePath, 'utf8');
        const patched = original.replace(patch.find, patch.replace);
        if (patched !== original) {
          fs.writeFileSync(filePath, patched);
          console.log(`[withAgpCompatibility] Patched ${patch.label}`);
        } else {
          console.log(`[withAgpCompatibility] Already clean or pattern not found: ${patch.label}`);
        }
      }

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
