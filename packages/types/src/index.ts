// Tipos compartilhados entre API, web e mobile

export type UserRole = 'ADMIN' | 'SALESPERSON'

export interface JwtPayload {
  sub: string      // user id
  email: string
  role: UserRole
}

export interface AuthTokens {
  accessToken: string
}

export interface UserPublic {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
  createdAt: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: UserPublic
  accessToken: string
}

export interface ApiError {
  message: string
  statusCode: number
}
