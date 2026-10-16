// Erro de aplicação com status HTTP — lançado pelos services e convertido
// em resposta pelo error handler global registrado em app.ts
export class AppError extends Error {
  readonly statusCode: number
  /** Payload estruturado opcional (ex.: violações da guarda SQL) — vai na resposta */
  details?: unknown
  /** Código legível por máquina (ex.: 'CONTRACT_NOT_DRAFT'); vai na resposta como `code` */
  readonly code?: string

  constructor(statusCode: number, message: string, details?: unknown, code?: string) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.details = details
    this.code = code
  }
}

export const notFound = (message: string, code?: string) =>
  new AppError(404, message, undefined, code)
export const badRequest = (message: string, code?: string) =>
  new AppError(400, message, undefined, code)
export const forbidden = (message: string, code?: string) =>
  new AppError(403, message, undefined, code)
export const conflict = (message: string, code?: string) =>
  new AppError(409, message, undefined, code)
export const unprocessable = (message: string, details?: unknown, code?: string) =>
  new AppError(422, message, details, code)
export const badGateway = (message: string, code?: string) =>
  new AppError(502, message, undefined, code)
