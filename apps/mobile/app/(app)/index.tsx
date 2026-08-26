// Aba inicial (E12): Equipe para o gerente; Hoje quando a empresa tem a
// Inteligência ligada; senão o dashboard legado (mantém testID="screen-home"
// para o Detox).
import { useIntelEnabled } from '../../src/hooks/useIntelEnabled'
import { useIsManager } from '../../src/hooks/useProfile'
import { LegacyDashboard } from '../../src/screens/LegacyDashboard'
import { HojeScreen } from '../../src/screens/HojeScreen'
import { ManagerHomeScreen } from '../../src/screens/ManagerHomeScreen'

export default function IndexScreen() {
  const intelEnabled = useIntelEnabled()
  const isManager = useIsManager()
  if (isManager) return <ManagerHomeScreen />
  return intelEnabled ? <HojeScreen /> : <LegacyDashboard />
}
