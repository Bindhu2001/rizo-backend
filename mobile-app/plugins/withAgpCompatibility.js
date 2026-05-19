const { withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// Pins Gradle wrapper to 8.10.2 and AGP to 8.5.2 to avoid the AGP 8.11.0 +
// Gradle 8.14.x incompatibility where autolinked native modules expose no
// Gradle variants ("No matching variant ... No variants exist").
// Also keeps Kotlin Gradle plugin at 2.1.21 for KSP compatibility.

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
          'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-bin.zip'
        );
        fs.writeFileSync(propsPath, contents);
        console.log('[withAgpCompatibility] Pinned Gradle wrapper to 8.10.2');
      }
      return cfg;
    },
  ]);
}

function withAgpAndKotlin(config) {
  return withProjectBuildGradle(config, (cfg) => {
    // Pin AGP to 8.5.2
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /classpath\(['"]com\.android\.tools\.build:gradle(?::[^'"]*)?['"]\)/g,
      "classpath('com.android.tools.build:gradle:8.5.2')"
    );
    // Pin Kotlin Gradle plugin to 2.1.21
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin(?::[^'"]*)?['"]\)/g,
      "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.21')"
    );
    return cfg;
  });
}

module.exports = function withAgpCompatibility(config) {
  config = withGradleWrapper(config);
  config = withAgpAndKotlin(config);
  return config;
};
