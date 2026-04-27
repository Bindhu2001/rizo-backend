const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * This plugin fixes the "No matching variant of project ... found" error
 * by telling Gradle to ignore AGP version mismatches between the app and libraries.
 * 
 * It also forces the classpath version to be consistent.
 */
module.exports = function withAgpCompatibility(config) {
  return withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // We add the rules at the very end of the file, safely.
    const compatibilityRule = `
// [withAgpCompatibility] Force compatibility for AGP version attributes
allprojects {
    configurations.all {
        resolutionStrategy {
            eachDependency { DependencyResolveDetails details ->
                if (details.requested.group == 'com.android.tools.build' && details.requested.name == 'gradle') {
                    details.useVersion("8.7.3") 
                }
            }
        }
    }
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

    // Also force the buildscript version
    cfg.modResults.contents = cfg.modResults.contents.replace(
        /classpath\(['"]com\.android\.tools\.build:gradle.*['"]\)/g,
        "classpath('com.android.tools.build:gradle:8.7.3')"
    );

    return cfg;
  });
};
