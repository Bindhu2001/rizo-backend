const { withProjectBuildGradle, withGradleProperties } = require('@expo/config-plugins');

module.exports = function withAgpCompatibility(config) {
  // 1. Fix build.gradle
  config = withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Force a consistent AGP version
    const agpMarker = '// [withAgpCompatibility:AGP]';
    if (!contents.includes(agpMarker)) {
      cfg.modResults.contents = contents + `
${agpMarker}
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

    // Force Kotlin plugin version if missing
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin['"]\)/g,
      "classpath(\"org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion\")"
    );

    return cfg;
  });

  // 2. Ensure gradle.properties has enough memory and correct kotlin version
  config = withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter(p => p.key !== 'org.gradle.jvmargs' && p.key !== 'android.kotlinVersion');
    cfg.modResults.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
    });
    cfg.modResults.push({
      type: 'property',
      key: 'android.kotlinVersion',
      value: '2.1.21',
    });
    return cfg;
  });

  return config;
};
