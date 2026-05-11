const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to ensure compatibility with AGP 8.11.0.
 * This plugin fixes the "No matching variant ... AgpVersionAttr" error by REMOVING
 * the attribute requirement from build configurations, allowing Gradle to match
 * dependencies even if they don't explicitly declare AGP 8.11.0 compatibility.
 */
module.exports = function withAgpCompatibility(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const buildGradlePath = path.join(config.modRequest.projectRoot, 'android', 'build.gradle');
      if (fs.existsSync(buildGradlePath)) {
        let contents = fs.readFileSync(buildGradlePath, 'utf-8');
        
        // 1. Pin AGP to 8.11.0
        contents = contents.replace(
          /classpath\s*\(\s*['"]com\.android\.tools\.build:gradle:?.*['"]\s*\)/g,
          "classpath('com.android.tools.build:gradle:8.11.0')"
        );
        if (!contents.includes("com.android.tools.build:gradle:8.11.0")) {
           contents = contents.replace(
             /classpath\(['"]com\.android\.tools\.build:gradle['"]\)/g,
             "classpath('com.android.tools.build:gradle:8.11.0')"
           );
        }
        
        // 2. Pin Kotlin to 2.1.21
        contents = contents.replace(
          /classpath\s*\(\s*['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin:?.*['"]\s*\)/g,
          "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.21')"
        );

        // 3. Remove any old AGP Fix blocks
        contents = contents.replace(/\/\/\s*Begin AGP Fix[\s\S]*?\/\/\s*End AGP Fix/g, "");
        contents = contents.replace(/allprojects\s*\{\s*configurations\.all\s*\{[\s\S]*?AgpVersionAttr[\s\S]*?\}\s*\}/g, "");

        // 4. Add the REMOVAL Fix (more robust than forcing)
        const agpFix = `
// Begin AGP Fix
allprojects {
    // afterEvaluate ensures we catch configurations added by plugins
    afterEvaluate { project ->
        project.configurations.all {
            def agpAttr = attributes.keySet().find { it.name == 'com.android.build.api.attributes.AgpVersionAttr' }
            if (agpAttr) {
                // Removing the attribute from the selection request allows matching
                // with any library regardless of its internal AGP version.
                attributes.removeAttribute(agpAttr)
            }
        }
    }
}
// End AGP Fix
`;
        if (!contents.includes('// Begin AGP Fix')) {
            contents += agpFix;
        }

        fs.writeFileSync(buildGradlePath, contents);
      }
      return config;
    },
  ]);
};
