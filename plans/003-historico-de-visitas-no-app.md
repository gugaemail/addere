# Plano 003: Devolver ao vendedor o histórico do próprio trabalho

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat b7be724..HEAD -- apps/api/src/modules/intelligence/app/ apps/mobile/app/\(app\)/rota/ apps/mobile/src/hooks/useIntel.ts`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P2
- **Esforço**: L
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
- **Revisado em**: 2026-10-06 — o plano passou a entregar as duas pontas
  (vendedor e gerente) na mesma passada, por decisão de produto: o histórico
  segue a mesma regra da carteira, e a carteira do gerente é a da equipe dele.

## Por que isso importa

O vendedor registra cada visita e **não tem como ver nenhuma delas depois**. A
API da Inteligência tem `POST /intel/app/visits` e `PATCH /intel/app/visits/:clientId`
e nenhum `GET`: a visita entra e nunca mais sai. No app existe histórico de
**pedido**, não de **visita**. Quem mais poderia aprender com o próprio padrão —
quantas visitas viraram pedido, em quais clientes a conversa não anda, quantas
paradas fora do plano deram certo — é exatamente quem não tem acesso a nada.

O risco de não ter isso não é só pedagógico: sem espelho, o vendedor não confia
no registro. Quem não confia no registro, para de registrar — e o `Visit` é o
que alimenta o cooldown de 7 dias do motor. Histórico invisível é o primeiro
passo para o plano do dia parar de rotacionar.

**O gerente entra na mesma regra.** A carteira do gerente é a de todos os
vendedores ligados a ele (`User.managerId`) — é assim no núcleo do app, em
`apps/api/src/modules/users/data-scope.ts`, e é a regra de negócio. O histórico
de visitas é o mesmo dado sob a mesma regra: o gerente precisa ver as visitas da
equipe dele, e só da equipe dele. Por isso este plano entrega **duas** rotas,
com duas travas diferentes, em vez de uma rota com um parâmetro frouxo.

## Estado atual

Arquivos envolvidos:

- `apps/api/src/modules/intelligence/app/visits.routes.ts` — hoje tem só
  `POST /visits` (linha 63) e `PATCH /visits/:clientId` (linha 120). **Não existe
  GET.** O cabeçalho do arquivo documenta a regra de posse:

```
// Visitas do vendedor (E7, D10): check-in idempotente por clientId gerado no
// app (offline-first). Prefixo /intel/app
```

- `apps/api/src/middleware/require-vendor-code.ts` — o preHandler que resolve
  `request.vendorCode`. O comentário dele define a invariante que este plano
  tem que respeitar:

```
// Compor após authenticate + requireCompany. Anexa request.vendorCode —
// TODA leitura/escrita das rotas /intel/app filtra por {companyId, vendorCode}.
```

- `apps/api/src/modules/intelligence/app/plan.routes.ts:82-101` — o exemplar de
  rota GET deste módulo: `planQuerySchema` com `zod`, `preHandler: guard`,
  404 com mensagem em português quando não há dado. Copie a forma.
- `packages/db/prisma/schema.prisma:925-950` — modelo `Visit`. Campos que a tela
  usa: `arrivedAt`, `leftAt`, `customerCode`, `loja`, `planItemId`, `result`,
  `noOrderReason`, `orderId`, `notes`.
- `apps/api/src/modules/intelligence/jobs/purge.ts:34-41` — **importante para a
  tela**: `notes` vira `null` depois de `config.retentionDays`, e `lat`/`lng`
  depois de 90 dias. Uma visita antiga aparece sem observação, por desenho.
- `apps/mobile/app/(app)/rota/` — já tem `index.tsx`, `carteira.tsx`,
  `semana.tsx`, `visita/[itemId].tsx` e `mensagem/[customerKey].tsx`. A tela
  nova entra aqui como irmã de `semana.tsx`.
- `apps/mobile/src/hooks/useIntel.ts` — padrão dos hooks de leitura: veja
  `usePlan` (linha 103) e `useWeekPlan` (linha 118).
- `apps/mobile/app/(app)/_layout.tsx:33` — quem vê a aba Rota:

```ts
const showRota = intelEnabled && (!isManager || hasVendorCode)
```

Para a rota do gerente (passo 7), os dois trechos que definem o recorte de
equipe. Desde o plano 007 existe **um resolvedor só** para toda a API, em
`apps/api/src/modules/users/data-scope.ts` — importe de lá e **não crie outro**.

`apps/api/src/modules/intelligence/manager/manager.routes.ts:56-58`:

```ts
function scopeFor(request: FastifyRequest): Promise<ViewerScope> {
  return resolveViewerScope(request.user.sub, request.user.role)
}
```

`apps/api/src/modules/users/data-scope.ts:107` — repare que o gerente **se
inclui**, cobrindo quem também vende com código próprio, e que a função é
**pura**: nunca consulta o banco.

```ts
export function sellerWhere(scope: ViewerScope): { OR?: Array<{ managerId: string } | { id: string }> } {
  if (scope.kind === 'team') return { OR: [{ managerId: scope.managerId }, { id: scope.managerId }] }
  if (scope.kind === 'self') return { OR: [{ id: scope.userId }] }
  return {}
}
```

## Esboço de tela

Entrada: botão **Histórico** no cabeçalho de `rota/index.tsx`, ao lado do botão
`Semana` que já existe. Rota do expo-router: `/(app)/rota/historico`.

```
┌─────────────────────────────────────────┐
│  ‹  Histórico                  30 dias ▾│
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │  32 visitas · 19 viraram pedido   │  │
│  │  Conversão 59%        7 fora do   │  │
│  │                       plano       │  │
│  └───────────────────────────────────┘  │
│                                         │
│  SEXTA, 06/10                   5 visitas│
│  ┌───────────────────────────────────┐  │
│  │ ● Mercado Ponto Certo             │  │
│  │   08:12 · 24 min        ✓ Pedido  │  │
│  ├───────────────────────────────────┤  │
│  │ ● Empório Raiz Forte              │  │
│  │   09:05 · 18 min      ✕ Sem pedido│  │
│  │   "comprou do concorrente"        │  │
│  ├───────────────────────────────────┤  │
│  │ ○ Atacado Vale do Sol    fora do  │  │
│  │   10:40 · 31 min         plano    │  │
│  │                         ✓ Pedido  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  QUINTA, 05/10                  6 visitas│
│  ┌───────────────────────────────────┐  │
│  │ ● Distribuidora Passo Largo       │  │
│  │   08:03 · 22 min    ↻ Remarcada   │  │
│  └───────────────────────────────────┘  │
│                                         │
│         [ carregar mais ]               │
└─────────────────────────────────────────┘
```

Regras da tela:

- `●` = visita que estava no plano (`planItemId !== null`); `○` = fora do plano,
  com o rótulo "fora do plano". Essa distinção é o ponto da tela: é ela que
  permite ao vendedor comparar o próprio faro com a sugestão do motor.
- Duração sai de `leftAt − arrivedAt`. Sem `leftAt`, mostre só a hora de chegada,
  **sem inventar duração**.
- Se o `plans/006-pedido-vale-check-in.md` já tiver sido executado, existem
  visitas com `source: 'ORDER'` — criadas automaticamente pelo pedido, sem
  check-in. Elas não têm duração nem GPS por desenho: mostre
  **"registrada pelo pedido"** no lugar do tempo, nunca "0 min".
- O motivo da não-venda aparece em itálico, entre aspas, só quando
  `result === 'NO_ORDER'`.
- Visita com `orderId` leva ao pedido, reutilizando a navegação de
  `pedidos/[id]`. Visita sem `orderId` não é tocável.
- **Estado vazio**: "Nenhuma visita registrada nos últimos 30 dias. Toque em
  Cheguei na Rota para registrar a primeira." — não deixe tela em branco.

## Quem acessa

São **duas rotas**, com travas diferentes:

| Perfil | Rota | Enxerga | Onde |
|---|---|---|---|
| Vendedor (`SALESPERSON` com `idVendProt`) | `GET /intel/app/visits` | **só as próprias visitas** — `{companyId, vendorCode}`, sem exceção | app, dentro de Rota |
| Gerente (`SALESPERSON` + `intel.manager`) | `GET /intel/manager/visits` | as visitas dos vendedores com `managerId` = ele, **mais as dele** se tiver `idVendProt` | painel web, em Equipe em campo |
| Administrador (`ADMIN` / `intel.admin`) | `GET /intel/manager/visits` | empresa inteira (`scope.managerId === null`) | painel web |
| `SUPERADMIN` | `GET /intel/manager/visits` | tenant escolhido por `companyId` | painel web |

**Decisão explícita e inegociável deste plano**: a rota `/intel/app/visits`
é estritamente do próprio vendedor e **não aceita parâmetro `vendorCode`**.
Parâmetro de vendedor em rota `/intel/app` é exatamente como vazamento entre
carteiras acontece. A visão do gerente é uma rota separada, sob `/intel/manager`,
com `scopeFor` + `sellerWhere` — o mesmo mecanismo das outras rotas de
gerente. Duas travas, duas superfícies, nenhuma ambiguidade.

Na rota do gerente, `vendorCode` é **filtro dentro do escopo**, nunca ampliação
dele: código pedido fora da equipe responde **403**, não lista vazia.

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Checar tipos | `npm run type-check` | exit 0, sem erros |
| Lint | `npm run lint` | exit 0 |
| Testes da API | `npm test --workspace=apps/api` | todos passam |
| Testes do mobile | `npm run test:unit --workspace=apps/mobile` | todos passam |

## Escopo

**Dentro do escopo:**
- `apps/api/src/modules/intelligence/app/visits.routes.ts` (acrescentar o GET do vendedor)
- `apps/api/src/modules/intelligence/app/visits.service.ts` (criar — montagem do DTO, compartilhada pelas duas rotas)
- `apps/api/src/modules/intelligence/app/__tests__/app-routes.test.ts` (acrescentar casos)
- `apps/api/src/modules/intelligence/manager/manager.routes.ts` (acrescentar o GET do gerente)
- `apps/api/src/modules/intelligence/manager/visits.service.ts` (criar — versão com escopo de equipe)
- `apps/api/src/modules/intelligence/manager/__tests__/manager-visits.test.ts` (criar)
- `packages/types/src/intelligence.ts` (acrescentar `VisitHistoryDto`)
- `apps/mobile/src/hooks/useIntel.ts` (acrescentar `useVisitHistory`)
- `apps/mobile/app/(app)/rota/historico.tsx` (criar)
- `apps/mobile/app/(app)/rota/index.tsx` (só o botão de entrada no cabeçalho)
- `apps/mobile/app/(app)/rota/_layout.tsx` (registrar a rota nova)
- `apps/web/src/hooks/useIntel.ts` (acrescentar `useTeamVisitHistory`)
- `apps/web/src/app/(admin)/inteligencia/equipe/page.tsx` (abrir o histórico a partir do card do vendedor)

**Fora do escopo (NÃO toque):**
- `apps/mobile/app/(app)/_layout.tsx` — **não** crie uma sexta aba. A barra já
  tem cinco itens e a tela é de consulta, não de uso diário.
- `apps/api/src/middleware/require-vendor-code.ts` — **não** relaxe o middleware
  para o gerente passar. A rota dele é outra, com outra trava.
- `apps/api/src/modules/intelligence/jobs/purge.ts` — a retenção está correta;
  a tela se adapta a ela, não o contrário.
- O schema do Prisma. Este plano não tem migration: o índice
  `@@index([companyId, vendorCode, arrivedAt])` já serve exatamente esta query.

## Fluxo de git

- Branch: `advisor/003-historico-de-visitas`
- Um commit por passo. Estilo: `api: GET de histórico de visitas`,
  `mobile: tela de histórico na Rota`.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado.
- **NÃO publique build do app** (`eas build`, `eas update`, loja). Este plano
  toca `apps/mobile`, e a decisão de entrega de 06/10/2026 é **um build só, no
  fim de todos os planos** — veja "Estratégia de entrega" em `plans/README.md`.
  Termine no código e pare.

## Passos

### Passo 1: Confirmar que não existe GET de visitas

**Verificar**: `grep -n "app.get" apps/api/src/modules/intelligence/app/visits.routes.ts`
→ **nenhuma linha**. Se já houver GET, PARE e reporte.

### Passo 2: DTO e serviço

Acrescente em `packages/types/src/intelligence.ts`, perto de `VisitInput`
(linha 367):

```ts
export interface VisitHistoryItemDto {
  id: string
  ymd: string            // dia civil de São Paulo, 'YYYY-MM-DD'
  arrivedAt: string      // ISO
  durationMin: number | null   // null quando não há leftAt
  customerCode: string
  loja: string
  customerName: string
  planned: boolean       // planItemId !== null
  result: 'ORDER' | 'NO_ORDER' | 'NOT_FOUND' | 'RESCHEDULED' | null
  noOrderReason: string | null
  orderId: string | null
}

export interface VisitHistoryDto {
  range: { from: string; to: string }
  total: number
  withOrder: number
  outOfPlan: number
  items: VisitHistoryItemDto[]
}
```

Crie `apps/api/src/modules/intelligence/app/visits.service.ts` com a montagem.
O nome do cliente vem de uma consulta separada a `Customer` por
`{ protheusCode, loja }` — **copie a técnica de `buildPlanDto` em
`apps/api/src/modules/intelligence/app/plan.service.ts:95-110`**, inclusive o
`Map` por chave `${protheusCode}|${loja ?? '01'}` e o fallback para o próprio
código quando o cliente não for encontrado.

O dia civil sai de `ymdSaoPaulo` (de `../engine/business-days`), nunca de
`toISOString().slice(0,10)` sobre `arrivedAt` — isso erraria o dia das visitas
do fim da tarde.

**Verificar**: `npm run type-check` → exit 0.

### Passo 3: A rota

Em `apps/api/src/modules/intelligence/app/visits.routes.ts`, acrescente antes do
`POST`:

```ts
const historyQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

app.get('/visits', { preHandler: guard }, async (request, reply) => {
```

Regras obrigatórias:

- `where` sempre com `companyId` **e** `vendorCode: request.vendorCode`. Sem
  exceção, sem parâmetro que permita outro vendedor.
- Janela máxima aceita: 90 dias — acima disso, responda 400 com
  `{ message: 'Período máximo de 90 dias' }`. **A rota recebe `from`/`to`; quem
  escolhe o período é a tela.**
- **As telas trabalham em mês civil, nunca em janela de N dias corridos** — a
  unidade de apuração deste produto é o mês, porque a meta do vendedor é mensal
  e a do gerente é a soma das metas da equipe. O seletor da tela do app é
  `Este mês` (padrão) e `Mês passado`; o painel usa o mês corrente. Só duas
  opções de propósito: três meses civis podem passar de 90 dias (jul+ago+set dão
  92) e bateriam no teto acima. O último dia do mês vem do calendário, nunca de
  `início + 30`.
- `orderBy: { arrivedAt: 'desc' }`, `take: 200`.
- Sem dado no período, responda **200 com lista vazia** e os contadores em zero
  — não 404. Lista vazia é resposta legítima aqui, diferente do plano do dia.

**Verificar**: `npm run type-check && npm test --workspace=apps/api` → exit 0.

### Passo 4: Testes da rota

Em `apps/api/src/modules/intelligence/app/__tests__/app-routes.test.ts`,
acrescente casos no mesmo estilo dos existentes (o arquivo já usa
`vi.mock('@addere/db')` com `test-utils/prisma-mock` e os usuários fixos
`seller-a`, `seller-no-code`, `seller-off`):

- `GET /visits` devolve só visitas do `vendorCode` do token — monte o mock com
  visitas de dois vendedores e confirme que só as de `V1` voltam;
- usuário sem `idVendProt` → 422 (vem de `requireVendorCode`, já testado no
  arquivo para outras rotas: espelhe aquele caso);
- empresa com Inteligência desligada → 403;
- janela maior que 90 dias → 400;
- período sem visitas → 200 com `total: 0` e `items: []`.

**Verificar**: `npm test --workspace=apps/api` → passam, incluindo os novos.

### Passo 5: Hook no mobile

Em `apps/mobile/src/hooks/useIntel.ts`, acrescente `useVisitHistory(from?, to?)`
espelhando `useWeekPlan` (linha 118): mesma convenção de chave de query, mesmo
tratamento de erro, mesmo cliente HTTP.

**Verificar**: `npm run type-check` → exit 0.

### Passo 6: A tela

Crie `apps/mobile/app/(app)/rota/historico.tsx` seguindo o esboço. Registre a
rota em `apps/mobile/app/(app)/rota/_layout.tsx` do mesmo jeito que `semana` já
está registrada, e acrescente o botão de entrada no cabeçalho de
`rota/index.tsx` ao lado do botão `Semana`.

Agrupe por `ymd` com cabeçalho de dia. Use os mesmos componentes e tokens de
estilo de `rota/semana.tsx` — **não** introduza biblioteca de UI nova.

**Verificar**: `npm run type-check && npm run lint && npm run test:unit --workspace=apps/mobile` → exit 0.

### Passo 7: A rota do gerente

Em `apps/api/src/modules/intelligence/manager/manager.routes.ts`, acrescente
`GET /visits` depois de `/team-map`, seguindo **exatamente** a forma das rotas
vizinhas:

```ts
app.get('/visits', { preHandler: [guard] }, async (request, reply) => {
  const company = await resolveTenant(request, reply, 'query')
  if (!company) return
  const scope = await scopeFor(request)
  // ...
})
```

Crie `apps/api/src/modules/intelligence/manager/visits.service.ts` que:

1. resolve os vendedores do escopo com `sellerWhere(scope)` sobre `User`,
   filtrando `idVendProt: { not: null }` — a mesma query de `loadSellers` em
   `manager.service.ts:41-52`;
2. aceita `vendorCode` opcional na query. **Se o código pedido não estiver entre
   os vendedores do escopo, responda 403**, não lista vazia;
3. carrega as visitas desses `vendorCode` na janela e reaproveita a mesma
   montagem de DTO do passo 2 — o item ganha um campo a mais, `sellerName`,
   porque sem saber de quem é a visita o gerente não sabe com quem falar;
4. aplica as mesmas regras de janela do passo 3 (padrão 30 dias, teto de 90).

**Verificar**: `npm run type-check && npm test --workspace=apps/api` → exit 0.

### Passo 8: Teste de posse da rota do gerente

Crie `apps/api/src/modules/intelligence/manager/__tests__/manager-visits.test.ts`
espelhando o padrão de `app/__tests__/app-routes.test.ts` (`vi.mock('@addere/db')`
com `test-utils/prisma-mock`). Casos **obrigatórios**:

- gerente A recebe só visitas de vendedores com `managerId` = A;
- gerente A pedindo `vendorCode` de vendedor da equipe B recebe **403**;
- usuário com `intel.admin` recebe a empresa inteira (`scope.managerId === null`);
- gerente que também vende aparece com as próprias visitas **uma vez só**.

Este é o teste mais importante do plano inteiro. Sem ele, a rota é um vazamento
de carteira esperando acontecer.

**Verificar**: `npm test --workspace=apps/api` → passa.

### Passo 9: Histórico no painel

Em `apps/web/src/hooks/useIntel.ts`, acrescente `useTeamVisitHistory(...)` no
formato de `useLosses` (linha 443). Em
`apps/web/src/app/(admin)/inteligencia/equipe/page.tsx`, torne o card de cada
vendedor capaz de abrir o histórico dele — o `vendorCode` do card vira o filtro
da chamada. Reaproveite `Card` e `Badge` de `@/components/ui`; a lista é a
mesma do esboço do app, em versão de tabela.

**Verificar**: `npm run lint && npm run build:web` → exit 0.

## Plano de testes

- Novos: cinco casos em `apps/api/src/modules/intelligence/app/__tests__/app-routes.test.ts`
  (passo 4), com ênfase no isolamento por `vendorCode`, **mais** os quatro casos
  de posse do gerente em `manager/__tests__/manager-visits.test.ts` (passo 8).
- Padrão a espelhar: os casos já existentes no mesmo arquivo, especialmente o de
  posse (`'Este plano não é seu'`), que é o teste irmão deste.
- As duas rotas têm que ser testadas separadamente. Um teste que passe para a
  rota do vendedor não diz nada sobre a do gerente: as travas são diferentes.
- Mobile: se houver teste unitário de helper puro para agrupar por dia, escreva-o
  em `apps/mobile/src/**/__tests__/`. A tela em si não ganha teste de render.

## Critérios de conclusão

- [ ] `npm run type-check` sai com 0
- [ ] `npm run lint` sai com 0
- [ ] `npm test --workspace=apps/api` passa, incluindo os cinco casos do vendedor
      e os quatro do gerente
- [ ] `npm run test:unit --workspace=apps/mobile` passa
- [ ] `npm run build:web` sai com 0
- [ ] `grep -n "app.get" apps/api/src/modules/intelligence/app/visits.routes.ts` retorna exatamente a rota nova
- [ ] `grep -rn "vendorCode" apps/api/src/modules/intelligence/app/visits.routes.ts` mostra que o GET do vendedor filtra por `request.vendorCode` e **não** aceita `vendorCode` vindo da query
- [ ] `grep -rn "function resolveViewerScope\|function sellerWhere" apps/api/src/modules/intelligence/` não retorna nada — nenhum resolvedor
      novo foi criado; o único vive em `users/data-scope.ts`
- [ ] `apps/mobile/app/(app)/_layout.tsx` **não** foi modificado (`git status`)
- [ ] `apps/api/src/middleware/require-vendor-code.ts` **não** foi modificado (`git status`)
- [ ] Linha de status atualizada em `plans/README.md`

## Condições de PARADA

- Já existir um `app.get` em `visits.routes.ts`.
- `require-vendor-code.ts` não anexar mais `request.vendorCode`.
- Parecer necessário aceitar `vendorCode` como parâmetro de query **na rota do
  vendedor** para a tela funcionar — isso é desenho errado; reporte em vez de
  implementar. (Na rota do gerente, `vendorCode` é esperado, mas só como filtro
  dentro do escopo.)
- Parecer necessário alterar `require-vendor-code.ts` para o gerente acessar
  qualquer coisa — a rota dele não passa por esse middleware.
- `scopeFor` ou `sellerWhere` tiverem assinatura diferente da citada em
  "Estado atual".
- A query precisar de índice novo (ela não precisa: o índice
  `[companyId, vendorCode, arrivedAt]` já existe no schema).

## Notas de manutenção

- A tela mostra menos informação à medida que a visita envelhece, por causa do
  expurgo: `notes` some depois de `retentionDays` e o GPS depois de 90 dias.
  Isso é correto e não deve ser "consertado" — mas quem for mexer na tela
  precisa saber, ou vai tratar `notes: null` como bug.
- Interage com o `plans/006-pedido-vale-check-in.md`: a partir dele, parte das
  visitas nasce do pedido, sem hora de chegada real nem coordenada. A tela tem
  que dizer isso em vez de exibir campos vazios.
- Desdobramento deixado de fora de propósito: as visitas de **um cliente** na
  ficha dele (`clientes/[id].tsx`). É a continuação natural e usa o mesmo
  serviço, filtrando por `customerCode`.
- Quem revisar deve olhar com lupa o `where` do GET. É a única coisa nesta
  mudança que, se errada, vaza carteira de um vendedor para outro.
