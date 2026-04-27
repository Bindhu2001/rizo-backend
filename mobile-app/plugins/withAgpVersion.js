const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Pins the Android Gradle Plugin to a specific version.
 * Without this, EAS resolves AGP 8.11.0 from Maven which breaks
 * React Native 0.81.x native modules ("No variants exist" error).
 * RN 0.81.5 is compatible with AGP 8.7.3.
 */
module.exports = function withAgpVersion(config, agpVersion = '8.7.3') {
  return withProjectBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;

    // Replace unversioned AGP classpath with pinned version
    if (contents.includes("classpath('com.android.tools.build:gradle')")) {
      cfg.modResults.contents = contents.replace(
        "classpath('com.android.tools.build:gradle')",
        `classpath('com.android.tools.build:gradle:${agpVersion}')`
      );
    } else if (contents.includes('classpath("com.android.tools.build:gradle")')) {
      cfg.modResults.contents = contents.replace(
        'classpath("com.android.tools.build:gradle")',
        `classpath("com.android.tools.build:gradle:${agpVersion}")`
      );
    }

    return cfg;
  });
};
