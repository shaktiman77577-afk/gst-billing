/**
 * Expo config plugin: sign release builds with the Play Store upload key.
 *
 * Adds a `release` signing config to android/app/build.gradle that reads the
 * keystore from environment variables (set by the GitHub release workflow):
 *   GST_UPLOAD_STORE_FILE      absolute path to upload.keystore
 *   GST_UPLOAD_STORE_PASSWORD  keystore password
 *   GST_UPLOAD_KEY_ALIAS       key alias (default "upload")
 *   GST_UPLOAD_KEY_PASSWORD    key password
 * When they are not set (normal APK test builds) the release build keeps
 * using the debug keystore exactly as before.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARK = '// [withReleaseSigning]';

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;
    if (src.includes(MARK)) return config;

    // 1) signing config that exists only when the env vars are present
    src = src.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        ${MARK}
        if (System.getenv("GST_UPLOAD_STORE_FILE")) {
            release {
                storeFile file(System.getenv("GST_UPLOAD_STORE_FILE"))
                storePassword System.getenv("GST_UPLOAD_STORE_PASSWORD")
                keyAlias System.getenv("GST_UPLOAD_KEY_ALIAS") ?: "upload"
                keyPassword System.getenv("GST_UPLOAD_KEY_PASSWORD")
            }
        }`,
    );

    // 2) release build type uses it (falls back to debug signing otherwise)
    src = src.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      `$1signingConfig System.getenv("GST_UPLOAD_STORE_FILE") ? signingConfigs.release : signingConfigs.debug`,
    );

    config.modResults.contents = src;
    return config;
  });

module.exports = withReleaseSigning;
