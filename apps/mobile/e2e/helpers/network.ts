import { execSync } from 'node:child_process'
import { device } from 'detox'

// No Android, alterna WiFi/dados do emulador via adb (roda no runner Node,
// não no app). O Detox não expõe execução de comandos no device.
export function adbShell(cmd: string) {
  execSync(`adb -s ${device.id} shell ${cmd}`, { stdio: 'ignore' })
}

export async function goOffline() {
  // Bloqueia toda conexão HTTP e força NetInfo a reportar offline
  await device.setURLBlacklist(['.*'])
  if (device.getPlatform() === 'android') {
    adbShell('svc wifi disable')
    adbShell('svc data disable')
  }
  // Aguarda NetInfo detectar a mudança
  await new Promise<void>((r) => setTimeout(r, 1500))
}

export async function goOnline() {
  await device.setURLBlacklist([])
  if (device.getPlatform() === 'android') {
    adbShell('svc wifi enable')
    adbShell('svc data enable')
  }
  // Aguarda NetInfo detectar reconexão e sync engine reagir
  await new Promise<void>((r) => setTimeout(r, 2000))
}
