// Erro de aplicação com status HTTP — lançado pelos services e convertido
// em resposta pelo error handler global registrado em app.ts
export class AppError extends Error {
  readonly statusCode: number
  /** Payload estruturado opcional (ex.: violações da guarda SQL) — vai na resposta */
  details?: unknown

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.details = details
  }
}

export const notFound = (message: string) => new AppError(404, message)
export const badRequest = (message: string) => new AppError(400, message)
export const forbidden = (message: string) => new AppError(403, message)
export const conflict = (message: string) => new AppError(409, message)
export const unprocessable = (message: string, details?: unknown) => new AppError(422, message, details)
export const badGateway = (message: string) => new AppError(502, message)
