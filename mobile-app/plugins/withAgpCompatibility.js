const { withProjectBuildGradle, withGradleProperties } = require('@expo/config-plugins');

/**
 * Clean and Force AGP Compatibility Plugin
 */
module.exports = function withAgpCompatibility(config) {
  // 1. Update build.gradle
  config = withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Clean up ANY previous markers from this or other versions of the plugin
    const markers = [
      '// [withAgpCompatibility]',
      '// [withAgpCompatibility:AGP]',
      '// [withAgpCompatibility:Rules]',
      '// [withAgpCompatibility:UniversalFix]',
      '// [withAgpCompatibility:Fixed]'
    ];
    
    markers.forEach(marker => {
      if (contents.includes(marker)) {
        // Simple way to remove: find the block starting with the marker and ending with the next block or end of file
        // Since we are appending, we can just cut from the first marker found
        const index = contents.indexOf(marker);
        contents = contents.substring(0, index);
      }
    });

    // Force AGP 8.11.0 in classpath
    contents = contents.replace(
      /classpath\(['"]com\.android\.tools\.build:gradle(?::[^'"]*)?['"]\)/g,
      "classpath('com.android.tools.build:gradle:8.11.0')"
    );

    // Add the definitive fix
    const newMarker = '// [withAgpCompatibility:FinalFix]';
    cfg.modResults.contents = contents + `
${newMarker}
allprojects {
    configurations.all {
        if (it.name != "incrementalScalaAnalysis") {
            attributes {
                // Force every project to match the app's expected AGP version attribute
                attribute(Attribute.of("com.android.build.api.attributes.AgpVersionAttr", String.class), "8.11.0")
            }
        }
    }
}
`;

    return cfg;
  });

  // 2. Update gradle.properties (Memory and Kotlin)
  config = withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter(p => 
      p.key !== 'org.gradle.jvmargs' && 
      p.key !== 'android.kotlinVersion'
    );
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
