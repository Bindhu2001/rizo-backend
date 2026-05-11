const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * This plugin solves the "No matching variant of project :react-native-screens was found" 
 * error by forcing all subprojects to share the same AGP version attribute.
 */
module.exports = function withAgpCompatibility(config) {
  return withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // 1. Ensure a consistent AGP version in the top-level buildscript
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /classpath\(['"]com\.android\.tools\.build:gradle(?::[^'"]*)?['"]\)/g,
      "classpath('com.android.tools.build:gradle:8.11.0')"
    );

    // 2. Force the AgpVersionAttr attribute on all configurations in all projects
    // This makes the consumer (app) and producers (libraries) match even if the libraries
    // don't explicitly define the attribute.
    const marker = '// [withAgpCompatibility:UniversalFix]';
    if (!contents.includes(marker)) {
      cfg.modResults.contents = cfg.modResults.contents + `
${marker}
allprojects {
    configurations.all {
        if (it.name != "incrementalScalaAnalysis") { // Avoid conflicts with some plugins
            attributes {
                attribute(com.android.build.api.attributes.AgpVersionAttr.ATTRIBUTE, objects.named(com.android.build.api.attributes.AgpVersionAttr, "8.11.0"))
            }
        }
    }
}
`;
    }

    return cfg;
  });
};
