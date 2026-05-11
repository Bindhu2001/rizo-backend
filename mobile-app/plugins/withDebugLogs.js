const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = (config) => {
  return withProjectBuildGradle(config, (config) => {
    console.log('--- DEBUG: android/build.gradle content start ---');
    console.log(config.modResults.contents);
    console.log('--- DEBUG: android/build.gradle content end ---');
    return config;
  });
};
