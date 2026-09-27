/**
 * Expo config plugin: keep the Android debug keystore stable across prebuilds.
 *
 * `expo prebuild --clean` regenerates android/app/debug.keystore on every run,
 * which gives each APK a different signature and forces users to uninstall
 * (wiping their local SQLite data) to install a new build.
 *
 * This plugin copies the committed stable keystore at <projectRoot>/keystore/debug.keystore
 * over android/app/debug.keystore after prebuild has generated its copy, so every
 * build is signed with the same key and installs cleanly over the previous one.
 *
 * Pure Node fs, no new dependencies.
 */

const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const withStableDebugKeystore = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const source = path.join(projectRoot, 'keystore', 'debug.keystore');
      const targetDir = path.join(
        config.modRequest.platformProjectRoot,
        'app'
      );
      const target = path.join(targetDir, 'debug.keystore');

      if (!fs.existsSync(source)) {
        console.warn(
          `[withStableDebugKeystore] Source keystore not found at ${source}; ` +
            'leaving the prebuild-generated debug.keystore in place.'
        );
        return config;
      }

      // platformProjectRoot exists by the time dangerous mods run, but be defensive.
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(source, target);
      // keystore files are typically owner-only; keep it readable to avoid build surprises.
      try {
        fs.chmodSync(target, 0o600);
      } catch {
        // non-fatal: Windows or unusual FS
      }

      const srcStat = fs.statSync(source);
      const dstStat = fs.statSync(target);
      console.log(
        `[withStableDebugKeystore] Copied stable debug keystore ` +
          `(${srcStat.size} bytes) over android/app/debug.keystore`
      );
      if (srcStat.size !== dstStat.size) {
        throw new Error(
          `[withStableDebugKeystore] Copy size mismatch: source ${srcStat.size} != target ${dstStat.size}`
        );
      }

      return config;
    },
  ]);
};

module.exports = withStableDebugKeystore;
