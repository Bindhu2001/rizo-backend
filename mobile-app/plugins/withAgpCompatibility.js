const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withAgpCompatibility(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const buildGradlePath = path.join(config.modRequest.projectRoot, 'android', 'build.gradle');
      if (fs.existsSync(buildGradlePath)) {
        let contents = fs.readFileSync(buildGradlePath, 'utf-8');
        
        // Pin AGP to 8.11.0
        contents = contents.replace(
          /classpath\s*\(\s*['"]com\.android\.tools\.build:gradle['"]\s*\)/g,
          "classpath('com.android.tools.build:gradle:8.11.0')"
        );
        
        // Pin Kotlin to 2.1.21
        contents = contents.replace(
          /classpath\s*\(\s*['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin['"]\s*\)/g,
          "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.21')"
        );

        // Add the AgpVersionAttr fix if not present
        if (!contents.includes('AgpVersionAttr')) {
          contents += `
allprojects {
    configurations.all {
        if (name == 'releaseRuntimeClasspath' || name == 'debugRuntimeClasspath') {
            def agpAttr = attributes.keySet().find { it.name == 'com.android.build.api.attributes.AgpVersionAttr' }
            if (agpAttr) {
                attributes.attribute(agpAttr, objects.named(agpAttr.type, "8.11.0"))
            }
        }
    }
}
`;
        }

        fs.writeFileSync(buildGradlePath, contents);
      }
      return config;
    },
  ]);
};
