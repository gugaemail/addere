// SHA-256 do texto do contrato no navegador (plano 014, decisão de desenho 1).
// O painel calcula o hash sobre o texto que vai exibir, compara com o gravado
// antes de habilitar o "Aceitar" e envia o hash que ELE calculou: o aceite
// prova que o texto exibido é o gravado. Testado em
// __tests__/contract-hash.test.ts contra o node:crypto da API.

/** Hash SHA-256 do texto em UTF-8, em hexadecimal minúsculo */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
