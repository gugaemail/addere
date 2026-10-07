# Plano 002: Fazer o `noOrderReason` sair do banco e virar informação

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 6a440c8..HEAD -- apps/api/src/modules/intelligence/manager/ apps/api/src/modules/intelligence/jobs/purge.ts apps/web/src/app/\(admin\)/inteligencia/equipe/`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: M
- **Risco**: LOW
- **Depende de**: nenhum
- **Categoria**: direction
- **Planejado em**: commit `6a440c8`, 2026-10-06
- **Revisado em**: 2026-10-07 — o plano 007 removeu `sellerScopeWhere` e
  `TeamScope`. Este plano foi atualizado para o resolvedor unificado e deve ser
  executado **a partir da branch do 007** (`advisor/007-unificar-escopo-de-equipe`,
  HEAD `7cd35cb`), não da `main`.

## Por que isso importa

O app **obriga** o vendedor a escrever por que não vendeu: a tela de visita
bloqueia o envio quando o resultado é `NO_ORDER` e o campo está vazio. Esse
texto é gravado em `Visit.noOrderReason` e **nunca é lido por nada** — nem
relatório, nem tela, nem prompt do agente. É a única fonte qualitativa do
produto sobre por que a venda não aconteceu, coletada com fricção imposta a
quem está na rua, e hoje serve só para ocupar disco. Fazer o gerente ver isso
agregado é o caminho mais curto entre o dado que já existe e uma decisão
comercial.

Há um segundo motivo, de privacidade: `noOrderReason` é texto livre digitado em
campo, pode conter nome e situação de pessoa física, e **não entra no expurgo de
retenção** — `notes` entra, ele não. Começar a exibir o campo sem corrigir isso
aumenta a exposição.

## Estado atual

Arquivos envolvidos:

- `packages/db/prisma/schema.prisma:925-950` — modelo `Visit`. Campos relevantes:
  `planItemId` (null = visita fora do plano), `arrivedAt`, `leftAt`, `result`,
  `noOrderReason`, `orderId`, `notes`. Índice `@@index([companyId, vendorCode, arrivedAt])`.
- `apps/api/src/modules/intelligence/app/visits.routes.ts:100` e `:138` — onde o
  campo é gravado (POST de check-in e PATCH de fechamento).
- `apps/mobile/app/(app)/rota/visita/[itemId].tsx:146` — a validação que torna o
  campo obrigatório:

```ts
if (result === 'NO_ORDER' && !noOrderReason.trim()) {
```

- `apps/api/src/modules/intelligence/manager/manager.routes.ts:64` — o guard
  compartilhado das rotas de gerente:

```ts
const guard = requireAnyPermission('intel.admin', 'intel.manager')
```

- `apps/api/src/modules/intelligence/manager/manager.service.ts:133-165` —
  `loadVisits`, que já faz a query de visitas por janela e **não** seleciona
  `noOrderReason`. Observe o padrão de janela larga em UTC com recorte fino por
  dia civil de São Paulo; repita essa técnica.
- `apps/api/src/modules/users/data-scope.ts` — o recorte de escopo **unificado**
  pelo plano 007, que você precisa reutilizar. `sellerWhere` é puro e lê só a
  decisão; nunca consulta o banco:

```ts
export type ViewerScope =
  | { kind: 'company' }
  | { kind: 'team'; managerId: string; ownVendorCode: string | null }
  | { kind: 'self'; userId: string; vendorCode: string | null }

export function sellerWhere(scope: ViewerScope): { OR?: Array<{ managerId: string } | { id: string }> } {
  if (scope.kind === 'team') return { OR: [{ managerId: scope.managerId }, { id: scope.managerId }] }
  if (scope.kind === 'self') return { OR: [{ id: scope.userId }] }
  return {}
}
```

  **Não** use `sellerScopeWhere` nem `TeamScope`: foram removidos pelo plano 007.
  `scopeFor` em `manager.routes.ts` já devolve um `ViewerScope` pronto.

- `apps/api/src/modules/intelligence/jobs/purge.ts:34-37` — o expurgo que hoje
  cobre `notes` e precisa cobrir `noOrderReason`:

```ts
const visitNotes = await prisma.visit.updateMany({
  where: { companyId, arrivedAt: { lt: retentionCutoff }, notes: { not: null } },
  data: { notes: null },
})
```

- `apps/web/src/app/(admin)/inteligencia/equipe/page.tsx` — a página que recebe
  a seção nova. É a tela centrada em visita, então é onde o motivo pertence.

Confirmação de que ninguém lê o campo hoje (rode no passo 1):
`grep -rn "noOrderReason" apps/api/src apps/web/src --include=*.ts --include=*.tsx`
→ só aparece em `visits.routes.ts` (schema de entrada e escrita).

## Esboço de tela

Seção nova no fim de `/inteligencia/equipe`, antes do mapa da equipe:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Por que não vendeu                      41 visitas sem pedido · este mês │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Motivos que se repetem                                                 │
│   ────────────────────────────────────────────────────────────────────   │
│   sem verba no momento                                 ████████████  12  │
│   comprou do concorrente                               ███████        7  │
│   dono não estava                                      █████          5  │
│   estoque ainda cheio                                  ████           4  │
│   preço alto                                           ███            3  │
│                                                                          │
│   ⚠ 10 motivos apareceram uma vez só — veja a lista completa             │
│                                                                          │
│   Últimas visitas sem pedido                                             │
│   ────────────────────────────────────────────────────────────────────   │
│   06/10  Mercado Ponto Certo      Renato    "sem verba no momento"       │
│   06/10  Empório Raiz Forte       Renato    "comprou do concorrente"     │
│   05/10  Atacado Vale do Sol      Ana       "dono não estava, volto 5ª"  │
│   05/10  Casa das Embalagens      Ana       "estoque ainda cheio"        │
│                                            [ ver todas as 41 ]           │
└──────────────────────────────────────────────────────────────────────────┘
```

Regras de leitura da tela:

- O agrupamento é por texto **normalizado** (minúsculas, espaços colapsados,
  pontuação final removida) — é uma aproximação honesta, não uma taxonomia.
  Por isso a seção se chama "Motivos que se repetem", e não "Motivos": com texto
  livre, o que não se repete não vira estatística.
- A linha de aviso sobre motivos únicos é obrigatória. Sem ela, o gerente lê as
  cinco barras como se fossem 100% dos casos.
- A lista de baixo mostra o texto **como foi digitado**, com cliente, vendedor e
  data. É o que dá contexto ao número.
- **O período segue o seletor que a página de Equipe já tem** (Hoje/Semana/Mês):
  não crie um seletor próprio para esta seção. E nada de janela de "30 dias" —
  a unidade de apuração do produto é o mês civil, porque a meta é mensal por
  vendedor e somada por equipe no caso do gerente.

## Quem acessa

| Perfil | Enxerga? | Escopo |
|---|---|---|
| Vendedor (`SALESPERSON`) | **Não** nesta tela | o espelho do próprio trabalho é o plano 003, no app |
| Gerente (`intel.manager`) | **Sim** | só os vendedores com `managerId` apontando para ele, mais ele mesmo |
| Administrador da empresa (`ADMIN` / `intel.admin`) | **Sim** | empresa inteira |
| `SUPERADMIN` | **Sim** | tenant escolhido por `companyId` |

O recorte sai de `sellerWhere`, de `users/data-scope.ts` — **não** reimplemente
o filtro de equipe e não recrie um resolvedor próprio: o plano 007 acabou de
unificar isso, e ter dois de novo desfaz o trabalho dele.

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Checar tipos | `npm run type-check` | exit 0, sem erros |
| Lint | `npm run lint` | exit 0 |
| Testes da API | `npm test --workspace=apps/api` | todos passam |
| Testes do web | `npm test --workspace=apps/web` | todos passam |

## Escopo

**Dentro do escopo:**
- `apps/api/src/modules/intelligence/manager/no-order.ts` (criar — agregação pura)
- `apps/api/src/modules/intelligence/manager/no-order.service.ts` (criar — query + DTO)
- `apps/api/src/modules/intelligence/manager/manager.routes.ts` (acrescentar uma rota)
- `apps/api/src/modules/intelligence/manager/__tests__/no-order.test.ts` (criar)
- `apps/api/src/modules/intelligence/jobs/purge.ts` (incluir `noOrderReason` no expurgo)
- `packages/types/src/intelligence.ts` (acrescentar o DTO novo)
- `apps/web/src/hooks/useIntel.ts` (acrescentar o hook novo)
- `apps/web/src/app/(admin)/inteligencia/equipe/page.tsx` (acrescentar a seção)

**Fora do escopo (NÃO toque):**
- `apps/mobile/**` — a captura do motivo já funciona. Trocar o campo de texto
  livre por lista de motivos pré-definidos é uma decisão de produto que muda o
  dado histórico; **não faça isso neste plano**.
- `apps/api/src/modules/intelligence/app/visits.routes.ts` — a escrita está certa.
- `apps/api/src/modules/intelligence/manager/losses.service.ts` — "Onde estou
  perdendo" decompõe faturamento, é outro eixo. Não misture.
- Qualquer alteração em `Visit` no schema. Este plano não precisa de migration.

## Fluxo de git

- Branch: `advisor/002-motivos-de-nao-venda`
- Um commit por passo. Estilo: `api: agregação de motivos de não-venda`,
  `web: seção Por que não vendeu na Equipe`.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado.

## Passos

### Passo 1: Confirmar que o campo é órfão

**Verificar**:
`grep -rn "noOrderReason" apps/api/src apps/web/src --include=*.ts --include=*.tsx`
→ todas as ocorrências em `apps/api/src/modules/intelligence/app/visits.routes.ts`.
Se já houver leitor em `manager/` ou no painel, PARE e reporte.

### Passo 2: Agregação pura

Crie `apps/api/src/modules/intelligence/manager/no-order.ts` — **sem Prisma,
sem I/O**, no mesmo estilo de `pilot-metrics.ts` e `team.ts` (funções puras
sobre fatos já carregados, para serem testáveis sem banco).

```ts
export interface NoOrderFact {
  ymd: string
  vendorCode: string
  sellerName: string
  customerName: string
  reason: string          // texto como digitado
  planned: boolean        // planItemId !== null
}

export interface ReasonBucket {
  normalized: string      // chave do agrupamento
  sample: string          // primeiro texto original do grupo, para exibir
  count: number
}

export interface NoOrderReport {
  total: number
  buckets: ReasonBucket[] // só os com count >= 2, ordem decrescente
  singletons: number      // quantos motivos apareceram uma vez só
  recent: NoOrderFact[]   // até 10, mais recentes primeiro
}
```

A normalização é: `trim()`, minúsculas, espaços internos colapsados para um só,
pontuação final (`.`, `,`, `;`, `!`) removida. Nada além disso — não tente
corrigir ortografia nem fundir sinônimos; agrupamento esperto que erra é pior
que agrupamento burro que acerta.

Empates de `count` desempatam por `normalized` em ordem alfabética, para a
saída ser determinística.

**Verificar**: `npm run type-check` → exit 0.

### Passo 3: Testes da agregação

Crie `apps/api/src/modules/intelligence/manager/__tests__/no-order.test.ts`.
Espelhe o estilo de `apps/api/src/modules/intelligence/manager/__tests__/`
(teste de função pura, sem mock de banco). Casos obrigatórios:

- dois textos que só diferem por caixa e espaço caem no mesmo bucket;
- motivo que aparece uma vez entra em `singletons` e **não** em `buckets`;
- `recent` vem ordenado do mais novo para o mais antigo e respeita o teto de 10;
- lista vazia devolve `total: 0`, `buckets: []`, `singletons: 0`.

**Verificar**: `npm test --workspace=apps/api` → passam, incluindo os novos.

### Passo 4: Serviço e rota

Crie `apps/api/src/modules/intelligence/manager/no-order.service.ts` com a query
que alimenta a função pura. Exigências:

- filtro: `companyId`, `result: 'NO_ORDER'`, `noOrderReason: { not: null }`,
  janela por `arrivedAt`;
- escopo de vendedores por `sellerWhere` (importe de `../../users/data-scope`);
- janela em UTC larga com recorte fino por dia civil de São Paulo, **copiando a
  técnica de `loadVisits` em `manager.service.ts:139-152`**;
- nome do cliente vem de `Customer` por `{ protheusCode, loja }`, e o nome do
  vendedor de `User.idVendProt` — ambos em consulta separada, como
  `plan.service.ts:buildPlanDto` faz.

Em `manager.routes.ts`, acrescente a rota depois de `/losses`:

```ts
app.get('/no-order-reasons', { preHandler: [guard] }, async (request, reply) => {
```

Use exatamente o mesmo `guard` e a mesma resolução de tenant/escopo das rotas
vizinhas — leia `/losses` (linha 96) e copie a forma.

Acrescente `NoOrderReportDto` em `packages/types/src/intelligence.ts`, junto dos
outros DTOs de gerente (perto de `LossesReportDto`, linha 522).

**Verificar**: `npm run type-check && npm test --workspace=apps/api` → exit 0.

### Passo 5: Incluir `noOrderReason` no expurgo

Em `apps/api/src/modules/intelligence/jobs/purge.ts`, logo depois do bloco
`visitNotes`, acrescente um bloco igual para `noOrderReason`, usando o mesmo
`retentionCutoff`, e inclua a contagem no `PurgeResult` devolvido.

Motivo: é texto livre digitado por humano, mesma natureza de `notes`, e hoje
sobrevive para sempre. Se houver teste de `purge`, atualize a expectativa do
retorno.

**Verificar**: `npm test --workspace=apps/api` → exit 0.

### Passo 6: Hook e seção na tela

Em `apps/web/src/hooks/useIntel.ts`, acrescente `useNoOrderReasons(...)` no
mesmo formato de `useLosses` (linha 443) — chave em `intelKeys`, `useIntelCompanyParam`,
`useIntelReady`.

Em `apps/web/src/app/(admin)/inteligencia/equipe/page.tsx`, acrescente a seção
do esboço **antes** do bloco do mapa da equipe. Use `Card` e `Badge` de
`@/components/ui`, como o resto da página. A barra de cada motivo é um `div` com
largura percentual — não acrescente biblioteca de gráfico.

**Verificar**: `npm run type-check && npm run lint && npm run build:web` → exit 0.

## Plano de testes

- Novos: `apps/api/src/modules/intelligence/manager/__tests__/no-order.test.ts`
  com os quatro casos do passo 3.
- Padrão a espelhar: os testes de função pura já existentes em
  `apps/api/src/modules/intelligence/manager/__tests__/`.
- A query e a página não ganham teste próprio — o repositório concentra teste em
  função pura e em rota. Se quiser cobrir a rota, espelhe
  `apps/api/src/modules/intelligence/app/__tests__/app-routes.test.ts`, que usa
  `vi.mock('@addere/db')` com `test-utils/prisma-mock`.

## Critérios de conclusão

- [ ] `npm run type-check` sai com 0
- [ ] `npm run lint` sai com 0
- [ ] `npm test --workspace=apps/api` passa, incluindo os testes novos
- [ ] `npm run build:web` sai com 0
- [ ] `grep -rn "noOrderReason" apps/api/src/modules/intelligence/manager apps/api/src/modules/intelligence/jobs/purge.ts` retorna linhas (o campo deixou de ser órfão)
- [ ] Nenhum arquivo em `apps/mobile/` foi modificado (`git status`)
- [ ] Linha de status atualizada em `plans/README.md`

## Condições de PARADA

- O grep do passo 1 mostra que algo já lê `noOrderReason` fora de `visits.routes.ts`.
- `sellerScopeWhere` não existir mais ou ter assinatura diferente da citada.
- Parecer necessário mexer em `apps/mobile/` para que a tela faça sentido — isso
  significa que o plano deveria ser de taxonomia de motivos, não de agregação.
- A rota exigir migration de banco. Este plano não tem migration.

## Notas de manutenção

- **A decisão de produto que este plano deliberadamente não toma**: trocar o
  texto livre por motivos pré-definidos no app (sem verba, concorrente, estoque
  cheio, responsável ausente, preço, outro + texto). Isso melhoraria muito a
  agregação, mas quebra a comparabilidade com o histórico já coletado e muda a
  rotina de quem está na rua. Decida depois de olhar os dados reais que esta
  tela vai expor pela primeira vez — e aí os buckets viram categoria de verdade.
- Quem revisar deve olhar: o escopo de equipe (vazamento entre gerentes é o
  risco real desta rota) e o passo 5, que muda retenção.
- A normalização é propositalmente burra. Qualquer evolução dela precisa de
  teste antes, porque muda contagem histórica sem avisar ninguém.
