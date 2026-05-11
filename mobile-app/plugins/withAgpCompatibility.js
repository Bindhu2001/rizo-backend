const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withAgpCompatibility(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'gradle') {
      config.modResults.contents = fixAgpClasspath(config.modResults.contents);
      config.modResults.contents = fixAgpCompatibility(config.modResults.contents);
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

function fixAgpCompatibility(buildGradle) {
  // Add a block to allprojects to handle the AgpVersionAttr mismatch
  const fixBlock = `
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency { DependencyResolveDetails details ->
            // This can help if there are specific version conflicts, but the attribute issue 
            // is usually handled by the variant selection logic.
        }
        
        // Force the AgpVersionAttr to match what the consumer expects if it's missing or different
        if (project.hasProperty('android')) {
            afterEvaluate {
                if (configurations.findByName('releaseRuntimeClasspath')) {
                    configurations.releaseRuntimeClasspath.attributes.attribute(
                        org.gradle.api.attributes.Attribute.of("com.android.build.api.attributes.AgpVersionAttr", String.class), 
                        "8.11.0"
                    )
                }
            }
        }
    }
}
`;
  if (!buildGradle.includes('AgpVersionAttr')) {
    return buildGradle + fixBlock;
  }
  return buildGradle;
}
