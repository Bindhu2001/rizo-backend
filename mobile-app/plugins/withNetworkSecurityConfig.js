const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Bundles extra root CAs into the app so HTTPS works on old Android devices
 * (e.g. Android 7/8 phones stuck on 2019–2021 security patches) whose system
 * trust store predates the chains our servers now serve:
 *  - v1.mypayrollmaster.online : Sectigo Root R46 (cross-signed by USERTrust RSA)
 *  - *.up.railway.app          : Let's Encrypt Root YE → ISRG Root X2 → ISRG Root X1
 *
 * The system store is still trusted; these certs are only added on top of it.
 */

const CERTS_DIR = path.join(__dirname, '..', 'assets', 'certs');

function getCertNames() {
  return fs
    .readdirSync(CERTS_DIR)
    .filter((f) => f.endsWith('.crt'))
    .map((f) => path.basename(f, '.crt'));
}

function withCertFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      const rawDir = path.join(resDir, 'raw');
      const xmlDir = path.join(resDir, 'xml');
      fs.mkdirSync(rawDir, { recursive: true });
      fs.mkdirSync(xmlDir, { recursive: true });

      const names = getCertNames();
      for (const name of names) {
        fs.copyFileSync(path.join(CERTS_DIR, `${name}.crt`), path.join(rawDir, `${name}.crt`));
      }

      const xml = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<network-security-config>',
        '  <base-config cleartextTrafficPermitted="false">',
        '    <trust-anchors>',
        '      <certificates src="system" />',
        ...names.map((n) => `      <certificates src="@raw/${n}" />`),
        '    </trust-anchors>',
        '  </base-config>',
        '</network-security-config>',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(xmlDir, 'network_security_config.xml'), xml);
      console.log(`[withNetworkSecurityConfig] Bundled ${names.length} root CA(s)`);
      return cfg;
    },
  ]);
}

function withManifestEntry(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });
}

module.exports = function withNetworkSecurityConfig(config) {
  config = withCertFiles(config);
  config = withManifestEntry(config);
  return config;
};
