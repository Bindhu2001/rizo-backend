const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withAgpCompatibility(config) {
  return withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Force a consistent AGP version to avoid "No matching variant" Gradle errors
    const marker = '// [withAgpCompatibility]';
    if (!contents.includes(marker)) {
      cfg.modResults.contents = contents + `
${marker}
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency { DependencyResolveDetails details ->
            if (details.requested.group == 'com.android.tools.build' && details.requested.name == 'gradle') {
                details.useVersion("8.11.0")
            }
        }
    }
}
`;
    }

    // Force classpath AGP version
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /classpath\(['"]com\.android\.tools\.build:gradle:[^'"]*['"]\)/g,
      "classpath('com.android.tools.build:gradle:8.11.0')"
    );

    return cfg;
  });
};
