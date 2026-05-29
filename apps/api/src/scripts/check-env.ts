const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'] as const

export function checkEnv(): void {
  const missing = REQUIRED.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(
      `[check-env] Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}\n` +
      'Verifique o arquivo .env ou as variáveis de ambiente do servidor.',
    )
  }
}
