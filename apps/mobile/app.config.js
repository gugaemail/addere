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
    // Assets gerados por `npm run icons` (scripts/generate-icons.mjs)
    icon: './assets/icon.png',
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-sqlite',
      // Upload de source maps/dSYMs é controlado pela env SENTRY_DISABLE_AUTO_UPLOAD (ver .env.example)
      '@sentry/react-native/expo',
      [
        // GPS de visita (E12, D10): leitura única no "Cheguei", when-in-use
        'expo-location',
        {
          locationWhenInUsePermission:
            'Usamos sua localização apenas no momento do check-in de visita, para registrar onde ela aconteceu.',
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      [
        'expo-media-library',
        {
          photosPermission: 'Salvar PDFs de pedidos no dispositivo.',
          savePhotosPermission: 'Salvar PDFs de pedidos no dispositivo.',
          isAccessMediaLocationEnabled: false,
        },
      ],
    ],
    splash: {
      image: './assets/splash-icon.png',
      backgroundColor: '#0D2045',
      resizeMode: 'contain',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0D2045',
      },
      package: variant.bundleId,
    },
    ios: {
      bundleIdentifier: variant.bundleId,
      infoPlist: {
        // O app só usa HTTPS padrão — isenta a declaração de criptografia no App Store Connect
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    updates: {
      url: 'https://u.expo.dev/a8b84402-c872-4b48-b3ba-875a21cc026e',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    extra: {
      appEnv: APP_ENV,
      appVersion: APP_VERSION,
      eas: {
        projectId: 'a8b84402-c872-4b48-b3ba-875a21cc026e',
      },
    },
  },
}
