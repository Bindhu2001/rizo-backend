const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withAgpCompatibility(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'gradle') {
      config.modResults.contents = fixAgpClasspath(config.modResults.contents);
    }
    return config;
  });
};

function fixAgpClasspath(buildGradle) {
  // Pin AGP to 8.11.0 in buildscript dependencies
  return buildGradle.replace(
    /classpath\(['"]com\.android\.tools\.build:gradle['"]\)/,
    "classpath('com.android.tools.build:gradle:8.11.0')"
  );
}
