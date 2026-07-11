import { execFileSync } from 'child_process'

// device.execOnDevice não existe na API do Detox — comandos adb precisam
// ser disparados no processo host via child_process, mirando o serial do device.
export function adbShell(...args: string[]) {
  execFileSync('adb', ['-s', device.id, 'shell', ...args])
}

export async function goOffline() {
  // Bloqueia toda conexão HTTP e força NetInfo a reportar offline
  await device.setURLBlacklist(['.*'])
  // No Android: desativa WiFi e dados via adb
  if (device.getPlatform() === 'android') {
    adbShell('svc', 'wifi', 'disable')
    adbShell('svc', 'data', 'disable')
  }
  // Aguarda NetInfo detectar a mudança
  await new Promise<void>((r) => setTimeout(r, 1500))
}

export async function goOnline() {
  await device.setURLBlacklist([])
  if (device.getPlatform() === 'android') {
    adbShell('svc', 'wifi', 'enable')
    adbShell('svc', 'data', 'enable')
  }
  // Aguarda NetInfo detectar reconexão e sync engine reagir
  await new Promise<void>((r) => setTimeout(r, 2000))
}
