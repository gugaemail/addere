export async function goOffline() {
  await device.setURLBlacklist(['.*'])
}

export async function goOnline() {
  await device.setURLBlacklist([])
  await new Promise<void>((r) => setTimeout(r, 1000)) // aguardar NetInfo detectar
}
