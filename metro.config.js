const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `.env` sets EXPO_PUBLIC_USE_RN_FETCH=1 (keep React Native's fetch). Babel bakes
// that value into node_modules/expo while bundling, but Metro's cache does not
// know the value changes the output: a cached copy made without it would bring
// expo/fetch back without a word. Making the value part of the cache version
// keeps the two apart.
config.cacheVersion = `${config.cacheVersion}:rn-fetch=${process.env.EXPO_PUBLIC_USE_RN_FETCH ?? ''}`;

module.exports = config;
