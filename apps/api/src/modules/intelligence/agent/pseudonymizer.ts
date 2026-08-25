// Pseudonimização por requisição (E6, LGPD §5.4/D13): o modelo só vê C1, C2…
// O mapa vive APENAS em memória durante a requisição — nunca em banco/log.
export class Pseudonymizer {
  private readonly byKey = new Map<string, string>()
  private readonly byPseudo = new Map<string, string>()
  private counter = 0

  /** Pseudônimo estável dentro da requisição para a chave real (code|loja). */
  code(realKey: string): string {
    const existing = this.byKey.get(realKey)
    if (existing) return existing
    this.counter += 1
    const pseudo = `C${this.counter}`
    this.byKey.set(realKey, pseudo)
    this.byPseudo.set(pseudo, realKey)
    return pseudo
  }

  /** Traduz o pseudônimo de volta (para reconstituir a resposta ao usuário). */
  real(pseudo: string): string | null {
    return this.byPseudo.get(pseudo) ?? null
  }

  /** Substitui todos os pseudônimos do texto pelos nomes reais fornecidos. */
  rehydrate(text: string, nameByKey: Map<string, string>): string {
    return text.replace(/\bC(\d+)\b/g, (match) => {
      const realKey = this.real(match)
      if (!realKey) return match
      return nameByKey.get(realKey) ?? match
    })
  }

  get size(): number {
    return this.counter
  }
}
