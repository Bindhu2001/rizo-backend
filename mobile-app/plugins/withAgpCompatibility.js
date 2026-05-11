const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to ensure compatibility with AGP 8.11.0 and Kotlin 2.1.21.
 * This plugin fixes the "No matching variant ... AgpVersionAttr" error by ensuring
 * that all project configurations (both consumer and producer) consistently use
 * the forced AGP version attribute for dependency resolution.
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
        // Fallback for cases where it's already fixed or using a different syntax
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

        // 3. Remove any old partial AgpVersionAttr fix blocks
        contents = contents.replace(/\/\/\s*Begin AGP Fix[\s\S]*?\/\/\s*End AGP Fix/g, "");
        // Also remove the ad-hoc one if it exists from previous versions of this plugin
        contents = contents.replace(/allprojects\s*\{\s*configurations\.all\s*\{[\s\S]*?AgpVersionAttr[\s\S]*?\}\s*\}/g, "");

        // 4. Add the robust AgpVersionAttr fix
        // We wrap it in a comment block so we can find and replace it later if needed.
        const agpFix = `
// Begin AGP Fix
allprojects {
    configurations.all {
        // Apply the attribute fix to ALL configurations that have the attribute.
        // This ensures matching between the app (consumer) and libraries (producers).
        def agpAttr = attributes.keySet().find { it.name == 'com.android.build.api.attributes.AgpVersionAttr' }
        if (agpAttr) {
            attributes.attribute(agpAttr, objects.named(agpAttr.type, "8.11.0"))
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
