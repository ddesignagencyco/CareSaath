/**
 * RN CLI config. Fonts in assets/fonts are linked into the native projects by
 * `npx react-native-asset` (needed for iOS). Android also has a copy under
 * android/app/src/main/assets/fonts, so a plain `npm run android` works.
 */
module.exports = {
  assets: ['./assets/fonts'],
};
