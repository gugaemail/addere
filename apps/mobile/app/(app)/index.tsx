// Aba inicial (E12): Hoje quando a empresa tem a Inteligência ligada;
// senão o dashboard legado (mantém testID="screen-home" para o Detox).
import { useIntelEnabled } from '../../src/hooks/useIntelEnabled'
import { LegacyDashboard } from '../../src/screens/LegacyDashboard'
import { HojeScreen } from '../../src/screens/HojeScreen'

export default function IndexScreen() {
  const intelEnabled = useIntelEnabled()
  return intelEnabled ? <HojeScreen /> : <LegacyDashboard />
}
