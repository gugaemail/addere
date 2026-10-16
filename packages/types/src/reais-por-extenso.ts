// Valor em reais por extenso, para o texto do contrato e do aditivo (plano 014).
// Puro e determinístico: o texto entra no documento cujo SHA-256 é gravado no
// aceite, então nada aqui depende de Intl nem de locale. Testado em
// apps/api/src/modules/billing/__tests__/reais-por-extenso.test.ts.

const UNITS = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
]

const TENS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
]

const HUNDREDS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
]

// 999.999.999.999,99: o maior valor com grupo de bilhões de três dígitos
const MAX_CENTS = 99_999_999_999_999

/** 1 a 999 por extenso ("cem" só no 100 exato; "cento" de 101 a 199) */
function below1000(n: number): string {
  if (n === 100) return 'cem'
  const parts: string[] = []
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  if (hundreds > 0) parts.push(HUNDREDS[hundreds])
  if (rest > 0) {
    if (rest < 20) {
      parts.push(UNITS[rest])
    } else {
      const unit = rest % 10
      const tens = TENS[Math.floor(rest / 10)]
      parts.push(unit > 0 ? `${tens} e ${UNITS[unit]}` : tens)
    }
  }
  return parts.join(' e ')
}

interface Group {
  text: string
  value: number
}

function integerGroups(n: number): { groups: Group[]; hasMillions: boolean; lowZero: boolean } {
  const billions = Math.floor(n / 1_000_000_000)
  const millions = Math.floor(n / 1_000_000) % 1000
  const thousands = Math.floor(n / 1000) % 1000
  const units = n % 1000
  const groups: Group[] = []
  if (billions > 0) {
    groups.push({
      text: billions === 1 ? 'um bilhão' : `${below1000(billions)} bilhões`,
      value: billions,
    })
  }
  if (millions > 0) {
    groups.push({
      text: millions === 1 ? 'um milhão' : `${below1000(millions)} milhões`,
      value: millions,
    })
  }
  // "mil", nunca "um mil"
  if (thousands > 0) {
    groups.push({ text: thousands === 1 ? 'mil' : `${below1000(thousands)} mil`, value: thousands })
  }
  if (units > 0) groups.push({ text: below1000(units), value: units })
  return {
    groups,
    hasMillions: billions > 0 || millions > 0,
    lowZero: thousands === 0 && units === 0,
  }
}

/**
 * Grupos não nulos separados por vírgula; a última junção usa " e " quando o
 * último grupo é menor que 100 ou múltiplo de 100 ("mil e cem", "um milhão e
 * duzentos mil", mas "um milhão, duzentos e cinquenta mil").
 */
function joinGroups(groups: Group[]): string {
  if (groups.length === 1) return groups[0].text
  const last = groups[groups.length - 1]
  const head = groups
    .slice(0, -1)
    .map((g) => g.text)
    .join(', ')
  const joiner = last.value < 100 || last.value % 100 === 0 ? ' e ' : ', '
  return `${head}${joiner}${last.text}`
}

/**
 * Centavos inteiros → reais por extenso. Ex.: 125050 → "mil, duzentos e
 * cinquenta reais e cinquenta centavos"; 100000000 → "um milhão de reais".
 * Lança RangeError para negativo, não inteiro ou acima de 999 bilhões.
 */
export function reaisPorExtenso(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_CENTS) {
    throw new RangeError(`valor fora do intervalo do extenso: ${cents}`)
  }
  const integer = Math.floor(cents / 100)
  const centavos = cents % 100

  let reais = ''
  if (integer === 1) {
    reais = 'um real'
  } else if (integer > 1) {
    const { groups, hasMillions, lowZero } = integerGroups(integer)
    // "um milhão de reais", mas "um milhão e cem reais"
    reais = `${joinGroups(groups)}${hasMillions && lowZero ? ' de reais' : ' reais'}`
  }

  const cent =
    centavos === 0 ? '' : centavos === 1 ? 'um centavo' : `${below1000(centavos)} centavos`

  if (reais && cent) return `${reais} e ${cent}`
  if (reais) return reais
  if (cent) return cent
  return 'zero reais'
}
