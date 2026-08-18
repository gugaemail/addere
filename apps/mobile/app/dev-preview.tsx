import { Redirect } from 'expo-router'
import { env } from '../src/config/env'
import { ComponentsPreview } from '../src/screens/dev/ComponentsPreview'

// Galeria de componentes para desenvolvimento — nunca acessível em produção
export default function DevPreview() {
  if (env.appEnv === 'production') return <Redirect href="/" />
  return <ComponentsPreview />
}
