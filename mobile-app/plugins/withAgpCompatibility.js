const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * This plugin solves two main issues:
 * 1. "No matching variant" errors caused by AGP 8+ version attributes in native libraries like react-native-screens.
 * 2. Ensures a stable AGP version is used instead of defaulting to a potentially incompatible cutting-edge version.
 */
module.exports = function withAgpCompatibility(config) {
  return withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // 1. Force a stable AGP version (8.7.2 is stable in 2026)
    // Matches both classpath('...:gradle:version') and classpath('...:gradle')
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /classpath\(['"]com\.android\.tools\.build:gradle(?::[^'"]*)?['"]\)/g,
      "classpath('com.android.tools.build:gradle:8.7.2')"
    );

    // 2. Add compatibility rules for AGP version attributes
    const marker = '// [withAgpCompatibility:Rules]';
    if (!contents.includes(marker)) {
      cfg.modResults.contents = cfg.modResults.contents + `
${marker}
allprojects {
    dependencies {
        attributesSchema {
            attribute(com.android.build.api.attributes.AgpVersionAttr.ATTRIBUTE) {
                compatibilityRules.add(AgpVersionCompatibilityRule)
                disambiguationRules.add(AgpVersionDisambiguationRule)
            }
        }
    }
}

class AgpVersionCompatibilityRule implements AttributeCompatibilityRule<com.android.build.api.attributes.AgpVersionAttr> {
    void execute(CompatibilityCheckDetails<com.android.build.api.attributes.AgpVersionAttr> details) {
        details.compatible()
    }
}

class AgpVersionDisambiguationRule implements AttributeDisambiguationRule<com.android.build.api.attributes.AgpVersionAttr> {
    void execute(MultipleCandidatesDetails<com.android.build.api.attributes.AgpVersionAttr> details) {
        details.closestMatch(details.candidateValues.first())
    }
}
`;
    }

    return cfg;
  });
};
