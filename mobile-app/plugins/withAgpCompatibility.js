const { withProjectBuildGradle } = require('@expo/config-plugins');

// Pins the Kotlin Gradle plugin to a version compatible with the KSP plugin
// that Gradle 8.14.x (used by EAS Build) resolves. Without this, expo-root-project
// detects Kotlin 1.9.25 from React Native's transitive buildscript deps and fails
// the "Can't find KSP version for Kotlin version" check.
//
// NOTE: This used to also force com.android.tools.build:gradle to 8.11.0 across
// all projects. That downgrade made the autolinked native modules publish no
// Gradle variants ("No matching variant ... No variants exist"), so it was removed.
// Expo SDK 54's expo-root-project plugin already enforces a consistent AGP version.
module.exports = function withAgpCompatibility(config) {
  return withProjectBuildGradle(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"]*)?['"]\)/g,
      "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.21')"
    );
    return cfg;
  });
};
