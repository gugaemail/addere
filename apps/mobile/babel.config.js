module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated/plugin deve ser sempre o último
    plugins: ['react-native-reanimated/plugin'],
  }
}
