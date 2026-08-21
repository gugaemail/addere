const fs = require('fs')
const path = require('path')

// O nome do projeto iOS depende do variant do app.config.js (Addere Dev / Addere Staging / Addere),
// então lemos o .xcworkspace gerado pelo `expo prebuild` em vez de fixar o nome.
const iosDir = path.join(__dirname, 'ios')
const workspace = fs.existsSync(iosDir)
  ? fs.readdirSync(iosDir).find((f) => f.endsWith('.xcworkspace'))
  : undefined
const iosScheme = workspace ? path.basename(workspace, '.xcworkspace') : 'Addere'

module.exports = {
  testRunner: {
    args: { $0: 'jest', config: 'e2e/jest.config.js' },
    jest: { setupTimeout: 120000 },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: `ios/build/Build/Products/Debug-iphonesimulator/${iosScheme}.app`,
      build: `xcodebuild -workspace ios/${iosScheme}.xcworkspace -scheme ${iosScheme} -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build`,
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 15' } },
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_7_API_34' } },
  },
  configurations: {
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
  },
}
