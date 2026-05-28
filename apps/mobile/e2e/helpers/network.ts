export async function goOffline() {
  // Bloqueia toda conexão HTTP e força NetInfo a reportar offline
  await device.setURLBlacklist(['.*'])
  // No Android: desativa WiFi e dados via adb
  if (device.getPlatform() === 'android') {
    await device.execOnDevice('adb shell svc wifi disable')
    await device.execOnDevice('adb shell svc data disable')
  }
  // Aguarda NetInfo detectar a mudança
  await new Promise<void>((r) => setTimeout(r, 1500))
}

export async function goOnline() {
  await device.setURLBlacklist([])
  if (device.getPlatform() === 'android') {
    await device.execOnDevice('adb shell svc wifi enable')
    await device.execOnDevice('adb shell svc data enable')
  }
  // Aguarda NetInfo detectar reconexão e sync engine reagir
  await new Promise<void>((r) => setTimeout(r, 2000))
}
