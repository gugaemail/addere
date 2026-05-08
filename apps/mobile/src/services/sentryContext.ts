import * as Sentry from '@sentry/react-native'
import { env } from '../config/env'

export function setSentryUser(user: { id: string; company: string }) {
  Sentry.setUser({ id: user.id })
  Sentry.setTag('company', user.company)
  Sentry.setTag('app_env', env.appEnv)
}

export function clearSentryUser() {
  Sentry.setUser(null)
}
