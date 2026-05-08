const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development'
const APP_VERSION = process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0'

const variants = {
  development: {
    name: 'Addere Dev',
    bundleId: 'com.addere.app.dev',
  },
  staging: {
    name: 'Addere Staging',
    bundleId: 'com.addere.app.staging',
  },
  production: {
    name: 'Addere',
    bundleId: 'com.addere.app',
  },
}

const variant = variants[APP_ENV] ?? variants.development

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: variant.name,
    slug: 'addere',
    version: APP_VERSION,
    scheme: 'addere',
    platforms: ['ios', 'android'],
    plugins: ['expo-router', 'expo-secure-store', 'expo-sqlite'],
    splash: {
      backgroundColor: '#0D2045',
      resizeMode: 'contain',
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#0D2045',
      },
      package: variant.bundleId,
    },
    ios: {
      bundleIdentifier: variant.bundleId,
    },
    extra: {
      appEnv: APP_ENV,
      appVersion: APP_VERSION,
    },
  },
}
