const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * This plugin fixes the "No matching variant of project ... found" error
 * by telling Gradle to ignore AGP version mismatches between the app and libraries.
 */
module.exports = function withAgpCompatibility(config) {
  return withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    const compatibilityRule = `
// [withAgpCompatibility] Force compatibility for AGP version attributes
allprojects {
    dependencies {
        attributesSchema {
            attribute(com.android.build.api.attributes.AgpVersionAttr.ATTRIBUTE) {
                compatibilityRules.add(AgpVersionCompatibilityRule)
            }
        }
    }
}

class AgpVersionCompatibilityRule implements AttributeCompatibilityRule<com.android.build.api.attributes.AgpVersionAttr> {
    void execute(CompatibilityCheckDetails<com.android.build.api.attributes.AgpVersionAttr> details) {
        details.compatible()
    }
}
`;

    if (!contents.includes('AgpVersionCompatibilityRule')) {
      cfg.modResults.contents = contents + compatibilityRule;
    }

    return cfg;
  });
};
