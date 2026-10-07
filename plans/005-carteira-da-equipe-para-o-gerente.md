# Plano 005: Dar ao gerente a carteira da equipe com os sinais da Inteligência

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat b7be724..HEAD -- apps/api/src/modules/intelligence/manager/ apps/mobile/src/screens/ManagerHomeScreen.tsx packages/types/src/intelligence.ts`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: M
- **Risco**: MED
- **Depende de**: nenhum
- **Categoria**: direction
- **Planejado em**: commit `6a440c8`, 2026-10-06
- **Revisado em**: 2026-10-07 — a fase 1 (planos 007, 001 e 002) foi mergeada na
  `main` (`b7be724`). Consequência para quem executa este plano: `sellerScopeWhere`,
  `TeamScope`, `resolveTeamScope` e `resolveDataScope` **não existem mais**. Foram
  substituídos pelo resolvedor único — `resolveViewerScope`, `sellerWhere`,
  `customerWhere` e `orderOwnerIds`, todos em
  `apps/api/src/modules/users/data-scope.ts`. Importe de lá e **não crie outro
  resolvedor**: o plano 007 existiu justamente para acabar com os dois que havia.
  Os trechos de "Estado atual" abaixo já refletem esse estado. Refaça a checagem
  de deriva contra `b7be724`.

## Por que isso importa

A regra de negócio é: **a carteira do gerente é a de todos os vendedores
ligados a ele**. O núcleo do app já funciona assim — Clientes e Pedidos
respeitam isso via `data-scope.ts`. A camada de Inteligência, não.

As rotas que entregam a carteira **com sinais** (quantos clientes estão em
ciclo, atrasados, em risco, novos, bloqueados) vivem sob `/intel/app` e passam
por `requireVendorCode`, que exige `idVendProt` e filtra por **um único**
`vendorCode`. Como o gerente criado pelo painel não tem código de vendedor —
o formulário nem pede —, ele recebe **422** nessas rotas. E o `ManagerHomeDto`,
que alimenta a home dele no app, não tem campo de carteira nenhum.

Resultado: o gerente vê a equipe como *lista de clientes* e como *números de
visita*, mas nunca como *carteira com risco*. Quem está esfriando, quantos
estão em risco, quantos bloqueados — exatamente a informação que justifica o
papel dele — não chega. Este plano fecha isso.

## Estado atual

Arquivos e fatos:

- `apps/api/src/modules/users/data-scope.ts` — a regra escrita, para o núcleo
  do app. O comentário do topo é a especificação deste plano:

```
// Vendedor: a própria carteira (Customer.vendorCode = idVendProt) e os
// próprios pedidos (Order.userId). Gerente — SALESPERSON com intel.manager e
// sem carteira própria — vê os clientes e os pedidos dos vendedores associados
// a ele (User.managerId); se um dia tiver carteira, ela entra junto.
```

- `apps/api/src/middleware/require-vendor-code.ts` — por que `/intel/app` não
  serve ao gerente: sem `idVendProt`, responde 422 com
  `'Usuário sem código de vendedor Protheus (fale com o administrador)'`.

- `apps/api/src/modules/intelligence/app/plan.routes.ts:46-79` — a rota
  `GET /intel/app/home` do **vendedor**, que é o espelho do que o gerente
  precisa. Repare no bloco de carteira que ela devolve:

```ts
return reply.send({
  llmSummary: plan?.llmSummary ?? null,
  plan: /* ... */,
  portfolio: { total: portfolio.length, byStatus },
  freshness: await getFreshness(companyId),
})
```

  `byStatus` é montado contando `CustomerSignal.status` dos clientes da
  carteira — leia as linhas 52-64 do mesmo arquivo e repita a técnica.

- `packages/types/src/intelligence.ts:442-456` — `ManagerHomeDto` **não tem**
  `portfolio`. Ele tem `period`, `goal`, `today`, `sellers[]`, `lastSyncAt`.

- `apps/api/src/modules/intelligence/manager/manager.routes.ts:56-58` — a forma
  canônica de resolver escopo nas rotas de gerente, delegando ao resolvedor
  **único** que o plano 007 criou:

```ts
function scopeFor(request: FastifyRequest): Promise<ViewerScope> {
  return resolveViewerScope(request.user.sub, request.user.role)
}
```

- `apps/api/src/modules/users/data-scope.ts:107` — o filtro de vendedores, que
  **já inclui o próprio gerente**, cobrindo o caso "gerente que também vende".
  É puro e não consulta o banco:

```ts
export function sellerWhere(scope: ViewerScope): { OR?: Array<{ managerId: string } | { id: string }> } {
  if (scope.kind === 'team') return { OR: [{ managerId: scope.managerId }, { id: scope.managerId }] }
  if (scope.kind === 'self') return { OR: [{ id: scope.userId }] }
  return {}
}
```

- `apps/api/src/modules/intelligence/manager/manager.service.ts:55-80` —
  `loadPortfolio(companyId, vendorCodes, monthPrefix)`, que **já** consulta
  `Customer where vendorCode: { in: vendorCodes }`. Ela conta positivação do
  mês; você vai precisar da mesma carteira, mas quebrada por status. Reaproveite
  a query de clientes, não duplique o conceito de carteira.

- **Fato que simplifica tudo**: `Customer.vendorCode` é um campo único por
  cliente. A união das carteiras da equipe é a soma delas, sem cliente repetido.
  Não escreva deduplicação.

- `apps/mobile/src/screens/ManagerHomeScreen.tsx` — a home do gerente no app.
  Estrutura atual, na ordem: saudação, "Meta do mês da equipe" (linha ~96),
  dois números pequenos ("visitas hoje" e "na equipe", linhas ~118-129),
  "Suas vendas" (só para gerente que vende, linha ~132) e os cards de vendedor.

## Esboço de tela

### A — Bloco novo na home do gerente (app)

Entra **depois** dos dois números pequenos e **antes** de "Suas vendas":

```
┌─────────────────────────────────────────┐
│  Carteira da equipe            418 clientes│
│  ┌───────────────────────────────────┐  │
│  │ ████████████░░░░░░░░░░░░░░░░░░░░  │  │
│  └───────────────────────────────────┘  │
│   ● Em ciclo      214                   │
│   ● Atrasado       96                   │
│   ● Em risco       61   ← toque para ver │
│   ● Novo           33                   │
│   ● Bloqueado      14                   │
│                                         │
│   61 clientes em risco em 3 vendedores  │
└─────────────────────────────────────────┘
```

As cores de status são as mesmas já usadas nos cards de cliente do app — não
invente paleta nova. Tocar em um status abre a lista filtrada (tela B).

### B — Carteira da equipe, lista (app)

Rota nova: `/(app)/equipe/carteira`, alcançável pelo bloco A.

```
┌─────────────────────────────────────────┐
│  ‹  Carteira da equipe                  │
│  [Todos][Em risco][Atrasado][Bloqueado] │
│  [ Todos os vendedores ▾ ]              │
├─────────────────────────────────────────┤
│  Mercado Ponto Certo       ● Em risco   │
│  Renato · há 84 dias · R$ 3.100 médio   │
├─────────────────────────────────────────┤
│  Empório Raiz Forte        ● Atrasado   │
│  Ana · há 53 dias · R$ 1.870 médio      │
├─────────────────────────────────────────┤
│  Atacado Vale do Sol       ● Em risco   │
│  Renato · há 97 dias · R$ 5.400 médio   │
└─────────────────────────────────────────┘
```

Diferença obrigatória em relação à carteira do vendedor: **cada linha mostra de
qual vendedor o cliente é**. Sem isso, o gerente não sabe com quem falar, e a
tela vira um relatório sem destinatário.

### C — Bloco no painel web, em Equipe em campo

Um card "Carteira da equipe" com os mesmos cinco números, acima dos cards de
vendedor em `/inteligencia/equipe`.

## Quem acessa

| Perfil | Enxerga? | Escopo |
|---|---|---|
| Vendedor (`SALESPERSON` sem `intel.manager`) | **Não** | continua com `/intel/app/portfolio`, a carteira dele |
| Gerente (`SALESPERSON` + `intel.manager`) | **Sim** | vendedores com `managerId` = ele, **mais ele mesmo** se tiver `idVendProt` |
| Administrador (`ADMIN` / `intel.admin`) | **Sim** | empresa inteira (`scope.managerId === null`) |
| `SUPERADMIN` | **Sim** | tenant escolhido por `companyId` |

Vendedor **sem** gerente associado não aparece para gerente nenhum — só para o
administrador. Isso é decisão registrada (D3b, revista em 26/08/2026) e não deve
ser "corrigida" neste plano.

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Checar tipos | `npm run type-check` | exit 0, sem erros |
| Lint | `npm run lint` | exit 0 |
| Testes da API | `npm test --workspace=apps/api` | todos passam |
| Testes do mobile | `npm run test:unit --workspace=apps/mobile` | todos passam |
| Build do painel | `npm run build:web` | exit 0 |

## Escopo

**Dentro do escopo:**
- `apps/api/src/modules/intelligence/manager/portfolio.ts` (criar — agregação pura)
- `apps/api/src/modules/intelligence/manager/portfolio.service.ts` (criar — queries)
- `apps/api/src/modules/intelligence/manager/manager.service.ts` (acrescentar o bloco `portfolio` ao `buildManagerHome`)
- `apps/api/src/modules/intelligence/manager/manager.routes.ts` (acrescentar `GET /customers/signals`)
- `apps/api/src/modules/intelligence/manager/__tests__/portfolio.test.ts` (criar)
- `packages/types/src/intelligence.ts` (`ManagerHomeDto.portfolio` e `TeamPortfolioDto`)
- `apps/mobile/src/hooks/useIntel.ts` (hook da lista)
- `apps/mobile/src/screens/ManagerHomeScreen.tsx` (bloco A)
- `apps/mobile/app/(app)/equipe/carteira.tsx` e `_layout.tsx` (tela B, criar)
- `apps/web/src/app/(admin)/inteligencia/equipe/page.tsx` (bloco C)
- `apps/web/src/hooks/useIntel.ts` (hook do painel)

**Fora do escopo (NÃO toque):**
- `apps/api/src/middleware/require-vendor-code.ts` — **não** relaxe esse
  middleware para aceitar gerente. Ele é a trava que impede uma rota de
  vendedor servir dado de outra carteira. A solução é rota nova sob
  `/intel/manager`, não middleware mais frouxo.
- `apps/api/src/modules/intelligence/app/**` — as rotas do vendedor ficam como
  estão.
- `apps/api/src/modules/users/data-scope.ts` — é o mecanismo do núcleo do app.
  Sob `/intel/manager` a convenção é `scopeFor` + `sellerWhere`. Não
  misture os dois: duas fontes de verdade para "quem é da minha equipe" é como
  um gerente acaba vendo a carteira de outro.
- `packages/db/prisma/schema.prisma` — sem migration.

## Fluxo de git

- Branch: `advisor/005-carteira-da-equipe`
- Um commit por passo. Estilo: `api: carteira da equipe por status`,
  `mobile: bloco de carteira na home do gerente`.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado.
- **NÃO publique build do app** (`eas build`, `eas update`, loja). Este plano
  toca `apps/mobile`, e a decisão de entrega de 06/10/2026 é **um build só, no
  fim de todos os planos** — veja "Estratégia de entrega" em `plans/README.md`.
  Termine no código e pare.

## Passos

### Passo 1: Confirmar as premissas

**Verificar**:
1. `grep -n "portfolio" packages/types/src/intelligence.ts | grep -i manager`
   → **nada**: `ManagerHomeDto` não tem carteira hoje. Se já tiver, PARE.
2. `grep -n "vendorCode" packages/db/prisma/schema.prisma | grep -i "model Customer" -A2`
   não é confiável; em vez disso abra o modelo `Customer` e confirme que
   `vendorCode` é **um campo escalar único**, não lista nem relação N:N. Se for
   lista, PARE: a premissa "sem cliente repetido" cai e o plano precisa de
   deduplicação.

### Passo 2: Agregação pura

Crie `apps/api/src/modules/intelligence/manager/portfolio.ts`, sem Prisma,
no estilo de `team.ts` e `pilot-metrics.ts`:

```ts
export interface PortfolioFact {
  customerCode: string
  loja: string
  vendorCode: string
  sellerName: string
  status: CustomerStatus
}

export interface TeamPortfolio {
  total: number
  byStatus: Record<CustomerStatus, number>
  /** Quantos vendedores distintos têm pelo menos um cliente em risco. */
  sellersWithAtRisk: number
  bySeller: Array<{ vendorCode: string; sellerName: string; total: number; atRisk: number }>
}
```

`byStatus` tem que trazer **todas** as chaves de `CustomerStatus`, com zero
quando não houver — senão a tela some com uma linha e o gerente acha que não
existe cliente naquele estado. Ordene `bySeller` por `atRisk` decrescente,
desempatando por `sellerName`.

**Verificar**: `npm run type-check` → exit 0.

### Passo 3: Testes da agregação

Crie `apps/api/src/modules/intelligence/manager/__tests__/portfolio.test.ts`.
Casos obrigatórios:

- status sem nenhum cliente aparece com `0` em `byStatus`;
- `sellersWithAtRisk` conta **vendedores**, não clientes;
- carteira vazia devolve `total: 0` e todas as chaves zeradas;
- `bySeller` sai ordenado por `atRisk` decrescente.

**Verificar**: `npm test --workspace=apps/api` → passam, incluindo os novos.

### Passo 4: Serviço e integração na home do gerente

Crie `apps/api/src/modules/intelligence/manager/portfolio.service.ts`:

1. resolva os vendedores do escopo com `loadSellers`-equivalente — reutilize a
   função já existente em `manager.service.ts` se ela for exportável; se não
   for, exporte-a em vez de copiar a query;
2. busque `Customer where { companyId, active: true, vendorCode: { in: codes }, protheusCode: { not: null } }`;
3. busque `CustomerSignal` desses clientes e case por `${customerCode}|${loja}`,
   **copiando a técnica de `plan.routes.ts:52-64`**;
4. monte os `PortfolioFact` e chame a função pura.

Acrescente o bloco em `buildManagerHome` e o campo `portfolio: TeamPortfolio`
em `ManagerHomeDto`. A home do gerente passa a trazer carteira junto com meta e
visitas, em **uma** requisição — não crie uma chamada separada para o bloco A.

**Verificar**: `npm run type-check && npm test --workspace=apps/api` → exit 0.

### Passo 5: Rota da lista

Em `manager.routes.ts`, acrescente depois de `/home`:

```ts
// GET /intel/manager/customers/signals?status=&vendorCode= — carteira da equipe
app.get('/customers/signals', { preHandler: [guard] }, async (request, reply) => {
```

Regras:

- `resolveTenant(request, reply, 'query')` e `scopeFor(request)`, como as rotas
  vizinhas;
- `vendorCode` é **filtro dentro do escopo**, nunca ampliação dele: se o código
  pedido não estiver entre os vendedores do escopo, responda **403**, não lista
  vazia. Lista vazia esconde o erro de permissão e vira bug de confiança.
- `status` opcional, validado contra `CustomerStatus` com `zod`;
- `take: 300`, ordenado por dias sem comprar decrescente.

**Verificar**: `npm run type-check && npm test --workspace=apps/api` → exit 0.

### Passo 6: Teste de posse da rota

Em `apps/api/src/modules/intelligence/manager/__tests__/`, acrescente teste de
rota espelhando o padrão de
`apps/api/src/modules/intelligence/app/__tests__/app-routes.test.ts`
(`vi.mock('@addere/db')` com `test-utils/prisma-mock`). Caso **obrigatório**:
gerente A pedindo `vendorCode` de um vendedor da equipe B recebe 403.

Este é o teste mais importante do plano. Sem ele, a rota é um vazamento de
carteira esperando acontecer.

**Verificar**: `npm test --workspace=apps/api` → passa.

### Passo 7: Bloco A na home do gerente (app)

Em `apps/mobile/src/screens/ManagerHomeScreen.tsx`, acrescente o bloco do
esboço A entre os dois números pequenos e a seção "Suas vendas". Use os
componentes e tokens de estilo já no arquivo (`s.card`, `s.cardTitle`,
`s.smallLabel`) — não introduza biblioteca nova. O dado já vem no payload do
passo 4.

**Verificar**: `npm run type-check && npm run test:unit --workspace=apps/mobile` → exit 0.

### Passo 8: Tela B e bloco C

Crie `apps/mobile/app/(app)/equipe/carteira.tsx` com a lista, registrando a
rota no `_layout.tsx` correspondente, e acrescente o hook em
`apps/mobile/src/hooks/useIntel.ts` no formato de `usePortfolio` (linha 133).

No painel, acrescente o card do esboço C em
`apps/web/src/app/(admin)/inteligencia/equipe/page.tsx`, acima dos cards de
vendedor, com hook novo em `apps/web/src/hooks/useIntel.ts`.

**Verificar**: `npm run lint && npm run build:web && npm run test:unit --workspace=apps/mobile` → exit 0.

## Plano de testes

- Novos: `apps/api/src/modules/intelligence/manager/__tests__/portfolio.test.ts`
  (quatro casos do passo 3) e o teste de posse do passo 6.
- Padrão a espelhar: os testes de função pura em
  `apps/api/src/modules/intelligence/manager/__tests__/` e o teste de posse
  `'Este plano não é seu'` em `app/__tests__/app-routes.test.ts`.

## Critérios de conclusão

- [ ] `npm run type-check` sai com 0
- [ ] `npm run lint` sai com 0
- [ ] `npm test --workspace=apps/api` passa, incluindo o teste de 403 entre equipes
- [ ] `npm run test:unit --workspace=apps/mobile` passa
- [ ] `npm run build:web` sai com 0
- [ ] `git diff --stat apps/api/src/middleware/require-vendor-code.ts` vazio
- [ ] `git diff --stat packages/db/prisma/schema.prisma` vazio
- [ ] `grep -rn "function resolveViewerScope\|function sellerWhere" apps/api/src/modules/intelligence/` não retorna nada — nenhum resolvedor
      novo foi criado; o único vive em `users/data-scope.ts`
- [ ] Linha de status atualizada em `plans/README.md`

## Condições de PARADA

- `ManagerHomeDto` já tiver `portfolio`.
- `Customer.vendorCode` não for um escalar único (a premissa de não haver
  cliente repetido cai).
- Parecer necessário alterar `require-vendor-code.ts` para o gerente entrar.
- `sellerWhere` ou `resolveViewerScope` tiverem assinatura diferente da
  citada em "Estado atual".

## Notas de manutenção

- Existem **dois** mecanismos de escopo de equipe no repositório:
  `users/data-scope.ts` (núcleo: clientes e pedidos) e
  `manager/manager.service.ts` (Inteligência). Eles concordam hoje, e os dois
  incluem o próprio gerente quando ele tem código de vendedor. Se um dia
  divergirem, o sintoma vai ser "a aba Clientes mostra um cliente que a carteira
  da Inteligência não mostra". **A unificação virou o `plans/007-unificar-escopo-de-equipe.md`**:
  se ele já tiver sido executado, importe o resolvedor unificado de
  `modules/users/data-scope.ts` em vez de `sellerWhere`.
- Quem revisar deve olhar, nesta ordem: (1) o 403 do `vendorCode` fora do
  escopo; (2) se o gerente que vende aparece uma vez só, não duas; (3) se
  `byStatus` traz todas as chaves.
- Desdobramento deixado de fora: ação a partir da lista (mandar o cliente para o
  plano de um vendedor). A rota `POST /intel/manager/plan-items` já existe e
  resolveria isso com pouco trabalho — mas é fluxo novo, e merece decisão à parte.
