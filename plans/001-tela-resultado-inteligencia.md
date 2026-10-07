# Plano 001: Dar tela às métricas de conversão que já existem na API

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 6a440c8..HEAD -- apps/web/src/hooks/useIntel.ts apps/api/src/modules/intelligence/manager/`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: S
- **Risco**: LOW
- **Depende de**: nenhum
- **Categoria**: direction
- **Planejado em**: commit `6a440c8`, 2026-10-06

## Por que isso importa

**Decisão de produto registrada em 06/10/2026 — leia antes de desenhar o
seletor de período.** A unidade de apuração da operação é o **mês civil**, e
não uma janela de N dias corridos. O motivo é a meta: a meta do vendedor é
mensal (`GoalSnapshot.period` é `YYYYMM`) e **a meta do gerente é a soma das
metas dos vendedores dele** — já implementado em `buildTeamGoal`, usado por
`buildManagerHome` em `apps/api/src/modules/intelligence/manager/manager.service.ts:354-379`.

Consequência direta e **obrigatória** neste plano: nada de "30 dias" nem
"90 dias" em lugar nenhum da tela. Meses têm 28, 29, 30 ou 31 dias, e uma
janela de 30 dias corridos nunca coincide com o período pelo qual o vendedor é
cobrado. Comparar uma janela móvel com uma meta mensal produz número que não
fecha com nada, e é o tipo de erro que o gerente descobre na frente do diretor.

Toda data deste plano sai do calendário, nunca de aritmética de dias: o fim do
mês vem do calendário, não de `início + 30`.

A pergunta mais cara do produto — "a sugestão do motor vende mais do que o
vendedor escolhendo sozinho?" — já está calculada, testada e exposta por HTTP,
e **nenhuma tela do painel a mostra**. O endpoint `GET /intel/manager/pilot-metrics`
devolve positivação da carteira, conversão sugestão→pedido, conversão da visita
fora do plano e a diferença entre as duas em pontos percentuais. O hook React
que consome esse endpoint também já existe. Falta só a página. É o maior retorno
por linha de código disponível no repositório hoje: zero backend, zero migration.

## Estado atual

Arquivos envolvidos:

- `apps/api/src/modules/intelligence/manager/pilot-metrics.ts` — cálculo puro das
  três métricas. Não precisa ser alterado.
- `apps/api/src/modules/intelligence/manager/manager.routes.ts:125` — rota
  `GET /pilot-metrics` (prefixo `/intel/manager`). Não precisa ser alterada.
- `apps/web/src/hooks/useIntel.ts:402` e `:489` — tipo e hook prontos, **sem
  nenhum consumidor** (confirme com o grep do passo 1).
- `apps/web/src/app/(admin)/inteligencia/equipe/page.tsx` — a página exemplar
  que você vai espelhar.
- `apps/web/src/app/(admin)/layout.tsx:57` — `NAV_GROUPS`, onde o item de menu entra.

O formato devolvido pelo cálculo (`pilot-metrics.ts:38-50`):

```ts
export interface Ratio {
  total: number
  hits: number
  pct: number | null
}

export interface PilotMetrics {
  range: { fromYmd: string; toYmd: string }
  conversionDays: number
  portfolioPositivation: Ratio
  suggestionConversion: Ratio
  outOfPlanConversion: Ratio
  /** Diferença em pontos percentuais (sugestão − fora do plano). */
  liftPp: number | null
  atRiskRecovery: Ratio
}
```

O hook pronto (`apps/web/src/hooks/useIntel.ts:489`):

```ts
/** @param from/to 'YYYY-MM-DD'. `enabled` desliga a busca enquanto não há período. */
export function usePilotMetrics(from: string, to: string, enabled = true) {
  const companyParams = useIntelCompanyParam()
  const ready = useIntelReady()
  return useQuery({
    enabled: enabled && ready,
    queryKey: intelKeys.pilotMetrics(from, to, companyParams.companyId),
    queryFn: () =>
      api
        .get<PilotMetricsResponse>('/intel/manager/pilot-metrics', {
          params: { from, to, ...companyParams },
        })
        .then((r) => r.data),
  })
}
```

Convenções da página a seguir — todas visíveis em
`apps/web/src/app/(admin)/inteligencia/equipe/page.tsx:1-40`: o arquivo começa
com `'use client'`, tem comentário de cabeçalho dizendo que tela é e de qual
épico, usa ícones do `lucide-react`, componentes de `@/components/ui` (`Card`,
`KpiCard`, `Tabs`, `Spinner`, `Badge`, `FreshnessBadge`), `SelectCompanyNotice`
para quando o SUPERADMIN ainda não escolheu empresa, e os helpers
`needsActiveCompany`, `pctLabel`, `todayInSaoPaulo` de `@/lib/intel-helpers`.
**Use `pctLabel` para todo percentual** — ele já trata `null`.

## Esboço de tela

Rota: `/inteligencia/resultado`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Resultado da Inteligência   [ Este mês ][ Mês passado ][ 3 meses ]      │
│  01/10/2026 a 06/10/2026 · conversão medida em 7 dias   ● dados de hoje   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌────────────────────────┐   ┌────────────────────────┐                │
│   │ Conversão da sugestão  │   │ Conversão fora do plano│                │
│   │        62,5%           │   │        41,2%           │                │
│   │   40 de 64 clientes    │   │   7 de 17 clientes     │                │
│   └────────────────────────┘   └────────────────────────┘                │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │  ▲ +21,3 pontos percentuais a favor da sugestão do motor         │   │
│   │  Quem o Addere mandou visitar comprou mais do que quem o          │   │
│   │  vendedor escolheu por conta própria, nesta janela.               │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌────────────────────────┐   ┌────────────────────────┐                │
│   │ Positivação da carteira│   │ Recuperação de risco   │                │
│   │        48,0%           │   │        22,9%           │                │
│   │  60 de 125 clientes    │   │  8 de 35 em risco      │                │
│   └────────────────────────┘   └────────────────────────┘                │
│                                                                          │
│   ⓘ Como lemos isto                                                       │
│   O denominador é cliente, não sugestão: um cliente sugerido três vezes   │
│   conta uma vez, a partir da primeira sugestão do período.                │
└──────────────────────────────────────────────────────────────────────────┘
```

Quando `liftPp` for negativo, a faixa do meio inverte: fundo de atenção, seta
para baixo e o texto "A escolha do vendedor converteu mais nesta janela" — é
informação legítima, não erro, e esconder isso destrói a credibilidade da tela.
Quando `liftPp` for `null` (algum dos lados sem denominador), a faixa vira
"Ainda não há visitas fora do plano suficientes para comparar".

## Quem acessa

O gating é o mesmo dos outros itens de Inteligência — copie literalmente de
`layout.tsx:90-97`:

| Perfil | Enxerga? | Como |
|---|---|---|
| Vendedor (`SALESPERSON`) | **Não** | não entra no painel web; o item some da sidebar |
| Gerente (usuário com permissão `intel.manager`) | **Sim**, só a equipe dele | `sellerScopeWhere` em `manager.service.ts:43` recorta por `managerId` |
| Administrador da empresa (`ADMIN`, nasce com `intel.admin`) | **Sim**, empresa inteira | `manager.routes.ts:51-56` |
| `SUPERADMIN` | **Sim**, escolhendo o tenant | parâmetro `companyId`, via `useIntelCompanyParam` |

O recorte por perfil já é resolvido no backend. **Não** adicione filtro de
vendedor na página: o endpoint devolve o escopo certo para quem chamou.

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Checar tipos | `npm run type-check` | exit 0, sem erros |
| Lint | `npm run lint` | exit 0 |
| Testes do web | `npm test --workspace=apps/web` | todos passam |
| Build do painel | `npm run build:web` | exit 0 |

## Escopo

**Dentro do escopo:**
- `apps/web/src/app/(admin)/inteligencia/resultado/page.tsx` (criar)
- `apps/web/src/app/(admin)/layout.tsx` (só para acrescentar um item em `NAV_GROUPS`)
- `apps/web/src/lib/pilot-metrics.ts` (criar — helpers puros de formatação)
- `apps/web/src/lib/__tests__/pilot-metrics.test.ts` (criar)

**Fora do escopo (NÃO toque):**
- `apps/api/**` — o endpoint está pronto e testado; se parecer que falta dado,
  isso é condição de PARADA, não motivo para editar a API.
- `apps/web/src/hooks/useIntel.ts` — o hook já existe e está correto. Só
  importe. Mexer nele é sinal de que você entendeu errado o plano.
- `apps/web/src/app/(admin)/piloto/page.tsx` — é outra coisa (bate em
  `/api/pilot/:id/metrics`, métricas de adoção do piloto, não de conversão).
  Não unifique as duas telas.

## Fluxo de git

- Branch: `advisor/001-tela-resultado-inteligencia`
- Um commit por passo. Estilo observado no `git log`: prefixo de área e frase
  curta, ex. `web: tela de resultado da Inteligência`.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado.

## Passos

### Passo 1: Confirmar a premissa central

**Verificar**: `grep -rn "usePilotMetrics\|PilotMetricsResponse" apps/web/src --include=*.tsx`
→ **nenhuma linha**. Se retornar alguma página, a tela já existe em alguma
forma: PARE e reporte.

### Passo 2: Helpers puros de formatação

Crie `apps/web/src/lib/pilot-metrics.ts` com funções puras, sem React:

- `liftLabel(liftPp: number | null): { tone: 'positivo' | 'negativo' | 'indefinido'; text: string }`
- `ratioSubtitle(r: Ratio): string` → `"40 de 64 clientes"`; com `total === 0`,
  devolve `"sem clientes na janela"`.
- `monthRange(kind: 'current' | 'previous' | 'last3', todayYmd: string): { from: string; to: string }`
  — puro e testável. **Regras não negociáveis**:
  - o primeiro dia é sempre `01` do mês em questão;
  - o último dia do mês vem do **calendário**, nunca de `primeiro + 30`. Em
    JavaScript, o idioma seguro é `new Date(Date.UTC(ano, mes, 0)).getUTCDate()`,
    que devolve 28, 29, 30 ou 31 conforme o mês e o ano bissexto;
  - a virada de ano é explícita: o mês anterior a janeiro é dezembro do ano
    passado;
  - tudo em UTC sobre o dia civil de São Paulo já resolvido por
    `todayInSaoPaulo()` — **não** chame `new Date()` dentro da função, senão ela
    deixa de ser testável e passa a depender do fuso de quem roda.
- `rangeLabel(fromYmd: string, toYmd: string): string` → `"01/10/2026 a 06/10/2026"`.
  Atenção: `range` vem em `YYYYMMDD` (veja `PilotMetrics.range` em
  `pilot-metrics.ts:44`), não em `YYYY-MM-DD`. Confirme antes de formatar.

Espelhe a estrutura de `apps/web/src/lib/losses.ts`, que é o helper puro
equivalente da tela de perdas.

**Verificar**: `npm run type-check` → exit 0.

### Passo 3: Testes dos helpers

Crie `apps/web/src/lib/__tests__/pilot-metrics.test.ts` espelhando
`apps/web/src/lib/__tests__/losses.test.ts`. Casos obrigatórios: lift positivo,
lift negativo, `liftPp === null`, `Ratio` com `total === 0` e `pct === null`.

Para `monthRange`, os quatro casos de calendário que pegam o erro clássico:
- **fevereiro em ano bissexto** (2028-02) → termina em 29;
- **fevereiro em ano comum** (2027-02) → termina em 28;
- **mês de 31 dias** (2026-01) → termina em 31, não em 30;
- **virada de ano**: em janeiro, `previous` é dezembro do ano anterior, e
  `last3` são outubro, novembro e dezembro do ano anterior.

Se algum desses casos exigir mudar a implementação, a implementação estava
errada — é exatamente para isso que eles existem.

**Verificar**: `npm test --workspace=apps/web` → todos passam, incluindo os novos.

### Passo 4: A página

Crie `apps/web/src/app/(admin)/inteligencia/resultado/page.tsx` seguindo o
esboço acima e a estrutura de `equipe/page.tsx`. Obrigatório:

- `'use client'` na primeira linha e comentário de cabeçalho explicando a tela.
- Guarda de empresa: `needsActiveCompany(...)` → `<SelectCompanyNotice />`,
  igual ao início do corpo de `equipe/page.tsx`.
- Estado de carregamento com `<Spinner />` e estado de erro com mensagem em
  português, ambos como em `equipe/page.tsx`.
- Seletor de período com `<Tabs>`, nesta ordem e com **"Este mês" como padrão**:
  - `Este mês` — dia 1 do mês corrente até hoje;
  - `Mês passado` — o mês fechado anterior, inteiro;
  - `3 meses` — os **três meses fechados** anteriores ao corrente. Fechados de
    propósito: misturar um mês parcial com meses completos distorce qualquer
    comparação, e a conversão ainda tem janela de 7 dias para fechar.

  Nenhum rótulo cita dias. O `from`/`to` saem de `monthRange` (passo 2), que
  parte de `todayInSaoPaulo()` de `@/lib/intel-helpers`.
- **Estado vazio desenhado**: quando `suggestionConversion.total === 0`, mostre
  "Ainda não há sugestões com janela de conversão fechada neste período" em vez
  de quatro cards com traço. Tela de métrica vazia sem explicação é a forma mais
  rápida de o gerente concluir que o produto está quebrado.

**Verificar**: `npm run type-check && npm run lint` → ambos exit 0.

### Passo 5: Item no menu

Em `apps/web/src/app/(admin)/layout.tsx`, dentro do grupo `'Inteligência'` de
`NAV_GROUPS`, logo **depois** de `/inteligencia` (Visão geral) e **antes** de
`/inteligencia/equipe`, acrescente:

```ts
{
  href: '/inteligencia/resultado',
  label: 'Resultado',
  match: (p) => p.startsWith('/inteligencia/resultado'),
  icon: TrendingUp,
  requires: { permission: ['intel.admin', 'intel.manager'], orAdmin: true },
},
```

`TrendingUp` precisa entrar no import de `lucide-react` do arquivo.

**Verificar**: `npm run build:web` → exit 0.

## Plano de testes

- Novos: `apps/web/src/lib/__tests__/pilot-metrics.test.ts`, cobrindo lift
  positivo, negativo, nulo, e `Ratio` zerado.
- Padrão a espelhar: `apps/web/src/lib/__tests__/losses.test.ts`.
- A página em si não ganha teste de render — o repositório não testa páginas do
  painel; a lógica testável tem que estar nos helpers puros do passo 2. Se você
  sentir vontade de testar a página, é sinal de que há lógica demais nela:
  mova para `lib/`.

## Critérios de conclusão

- [ ] `npm run type-check` sai com 0
- [ ] `npm run lint` sai com 0
- [ ] `npm test --workspace=apps/web` passa, incluindo os testes novos
- [ ] `npm run build:web` sai com 0
- [ ] `grep -rn "usePilotMetrics" apps/web/src --include=*.tsx` retorna exatamente
      a página nova
- [ ] Nenhum arquivo fora da lista de escopo foi modificado (`git status`)
- [ ] Linha de status atualizada em `plans/README.md`

## Condições de PARADA

- O grep do passo 1 encontra consumidores: a tela já existe de alguma forma.
- O endpoint devolve 403 ou 404 em ambiente de desenvolvimento — isso é
  configuração de permissão ou de tenant, não assunto desta tela.
- O campo `range` vier em formato diferente de `YYYYMMDD`.
- Parecer necessário alterar qualquer arquivo em `apps/api/`.

## Notas de manutenção

- A janela de conversão (`conversionDays`) vem da API, não é escolha da tela.
  Se um dia virar parâmetro por empresa, o rótulo "conversão medida em N dias"
  continua correto porque lê do payload.
- Quem revisar deve olhar com lupa o caso `liftPp` negativo: a tentação de
  esconder resultado ruim aparece na primeira revisão de design.
- Deixado de fora de propósito: recorte por vendedor dentro da tela. O endpoint
  hoje responde pelo escopo de quem chama; filtro por vendedor é trabalho de
  backend e entra no plano 004.
