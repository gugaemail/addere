type AppEnv = 'development' | 'staging' | 'production'

export const ENV = {
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333',
  APP_ENV: (process.env.EXPO_PUBLIC_APP_ENV ?? 'development') as AppEnv,
} as const

export const IS_DEV = ENV.APP_ENV === 'development'
export const IS_STAGING = ENV.APP_ENV === 'staging'
export const IS_PRODUCTION = ENV.APP_ENV === 'production'
