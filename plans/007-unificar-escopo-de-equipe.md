# Plano 007: Unificar os dois mecanismos de escopo de equipe

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 6a440c8..HEAD -- apps/api/src/modules/users/data-scope.ts apps/api/src/modules/intelligence/manager/manager.service.ts apps/api/src/modules/customers/ apps/api/src/modules/orders/`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: M
- **Risco**: HIGH — este plano muda **quem enxerga o quê**. É a maior área de
  impacto de toda a série.
- **Depende de**: nenhum
- **Categoria**: bug
- **Planejado em**: commit `6a440c8`, 2026-10-06
- **Revisado em**: 2026-10-07, depois de uma execução que parou no passo 4. A
  "Forma alvo" original estava errada e foi corrigida — leia a seção
  "Correção de 07/10/2026" antes de qualquer coisa. Os passos 1 a 3 **já foram
  executados e commitados**; comece pelo passo 2-bis.

## Por que isso importa

Existem hoje **dois** mecanismos independentes que respondem à mesma pergunta —
"quais vendedores este usuário enxerga?" — e eles **discordam em um caso real**.

O núcleo do app (Clientes e Pedidos) usa `modules/users/data-scope.ts`. A camada
de Inteligência usa `modules/intelligence/manager/manager.service.ts`. A regra
de negócio é a mesma nos dois; a implementação, não.

**O bug concreto**: um usuário `ADMIN` que também receba a permissão
`intel.manager` passa a ver **zero clientes** na aba Clientes do app, enquanto
continua vendo a empresa inteira no painel de Inteligência. Veja por quê abaixo —
é uma condição alcançável só concedendo uma permissão pelo painel, sem nenhuma
alteração de código.

Enquanto os dois existirem, qualquer plano novo que precise de escopo de equipe
tem que escolher um — e escolher errado é como um gerente acaba vendo a carteira
de outro.

## Estado atual

### Mecanismo A — núcleo do app

`apps/api/src/modules/users/data-scope.ts`. Consumidores:
`apps/api/src/modules/customers/customers.service.ts:14` (lista de clientes) e
`apps/api/src/modules/orders/orders.routes.ts:29` (lista de pedidos).

```ts
export type DataScope =
  | { kind: 'self'; vendorCode: string | null }
  | { kind: 'team'; userIds: string[]; vendorCodes: string[] }

/** SUPERADMIN tem o catálogo inteiro de permissões — não é gerente de ninguém. */
export async function isTeamManager(userId: string, role: UserRole): Promise<boolean> {
  if (role === 'SUPERADMIN') return false
  const permissions = await getEffectivePermissions(userId, role)
  return permissions.has('intel.manager')
}

async function loadTeam(managerId: string) {
  return prisma.user.findMany({
    where: { active: true, managerId, idVendProt: { not: null } },
    select: { id: true, idVendProt: true },
  })
}
```

E o filtro final:

```ts
/** Trecho do `where` de Customer para o recorte. Equipe vazia → lista vazia. */
export function customerScopeWhere(scope: DataScope): {
  vendorCode?: string | { in: string[] }
} {
  if (scope.kind === 'team') return { vendorCode: { in: scope.vendorCodes } }
  return scope.vendorCode ? { vendorCode: scope.vendorCode } : {}
}
```

### Mecanismo B — Inteligência

`apps/api/src/modules/intelligence/manager/manager.service.ts:20-45`:

```ts
export interface TeamScope {
  /** null = sem recorte por gerente (vê a empresa inteira). */
  managerId: string | null
}

export function resolveTeamScope(input: { viewerId: string; isAdmin: boolean }): TeamScope {
  if (input.isAdmin) return { managerId: null }
  return { managerId: input.viewerId }
}

export function sellerScopeWhere(scope: TeamScope): { OR?: Array<{ managerId: string } | { id: string }> } {
  return scope.managerId ? { OR: [{ managerId: scope.managerId }, { id: scope.managerId }] } : {}
}
```

E quem o alimenta, em `manager.routes.ts:52-61`, define `isAdmin` como
**SUPERADMIN ou `intel.admin`**.

### As quatro divergências

1. **`intel.admin` é ignorado pelo mecanismo A.** `isTeamManager` olha só
   `intel.manager`. Logo, `ADMIN` + `intel.manager` cai em `kind: 'team'`,
   `loadTeam` devolve os usuários cujo `managerId` é ele (normalmente nenhum), e
   `customerScopeWhere` produz `{ vendorCode: { in: [] } }` — que no Prisma não
   casa com nada. **A aba Clientes fica vazia.** No mecanismo B, o mesmo usuário
   é `isAdmin` e vê a empresa inteira. Essa é a divergência que motiva o plano.
2. **`loadTeam` não filtra por `companyId`.** Hoje é inofensivo porque quem
   chama filtra a empresa depois — confirme isso em
   `apps/api/src/modules/orders/orders.service.ts` antes de concluir que está
   tudo bem —, mas é uma trava a menos num ponto onde a trava é barata.
3. **Formatos de saída diferentes para a mesma pergunta.** A devolve
   `vendorCodes`/`userIds`; B devolve um fragmento de `where` para `User`. Quem
   escreve código novo precisa saber qual dos dois a camada exige.
4. **Existe um terceiro ponto que decide escopo sozinho.**
   `buildManagerHome` em `manager.service.ts:354-357` não passa por `scopeFor`
   nem por `resolveTeamScope` — ele constrói o recorte à mão:

```ts
export async function buildManagerHome(companyId: string, managerId: string): Promise<ManagerHome> {
  const todayYmd = ymdSaoPaulo(new Date())
  const period = todayYmd.slice(0, 6)
  const scope: TeamScope = { managerId }
```

   E a rota chama `buildManagerHome(company.id, request.user.sub)` direto, sem
   resolver permissão. Efeito: um `ADMIN` que abra a home do gerente vê **só os
   subordinados diretos dele**, não a empresa — diferente de todas as outras
   rotas de `/intel/manager`. Pode até ser intencional ("é a home *do gerente*"),
   mas hoje é implícito e não está escrito em lugar nenhum.

   **Este plano não muda esse comportamento.** Ele apenas o torna explícito:
   `buildManagerHome` passa a receber um `ViewerScope` já resolvido e, se a
   intenção for mesmo "sempre a equipe de quem chamou", isso vira uma linha
   nomeada em vez de um literal perdido no meio da função.

### O que os dois já acertam igual

Ambos incluem **o próprio gerente** no recorte, cobrindo o gerente que também
vende com código próprio: A faz `userIds: [userId, ...team]` e
`vendorCodes: [ownCode?, ...team]`; B faz `OR: [{managerId}, {id: managerId}]`.
Preserve esse comportamento — ele é correto e está documentado nos dois lados.

## A forma alvo

### Correção de 07/10/2026 — leia isto antes dos passos

A primeira execução deste plano parou no passo 4, numa condição de PARADA
legítima: o teste pré-existente
`manager/__tests__/manager-routes.test.ts > GET /intel/manager/team > gerente: a consulta filtra pela equipe de quem pediu`
falhou. O executor **não** ajustou o teste, e fez certo.

A causa é um defeito deste plano, não do código. A forma alvo original mandava
`resolveViewerScope` devolver `userIds` e `vendorCodes` já carregados. Para
isso ele consulta `prisma.user.findMany` **sempre** que o escopo é `team`. Só
que a camada de Inteligência nunca lê esses dois campos — `sellerWhere` usa
apenas `managerId`, e `loadSellers` faz a própria consulta logo depois. Resultado:

1. uma consulta redundante ao banco em **todo** request de `/intel/manager/*`
   feito por um gerente;
2. o `prismaMock.user.findMany.mock.calls[0]` que o teste inspeciona passa a
   ser a consulta do resolvedor, não a do `loadSellers`.

Trocar a asserção para `mock.calls[1]` faria o teste passar e **esconderia a
consulta redundante** — é exatamente a "normalização de bug" contra a qual este
plano avisa. A correção certa é separar **classificar o escopo** de **carregar
a equipe**.

### A forma alvo corrigida

`ViewerScope` carrega só a *decisão*, que é barata. Quem precisa da lista de
vendedores pede explicitamente:

```ts
export type ViewerScope =
  | { kind: 'company' }                                        // SUPERADMIN ou intel.admin
  | { kind: 'team'; managerId: string; ownVendorCode: string | null }
  | { kind: 'self'; userId: string; vendorCode: string | null }

/** Barato: permissões + o próprio idVendProt. NÃO consulta a equipe. */
export async function resolveViewerScope(userId, role): Promise<ViewerScope>

/** Puro, só lê `managerId`. É o que a Inteligência usa. */
export function sellerWhere(scope: ViewerScope): { OR?: ... }

/** Estes dois carregam a equipe sob demanda — só o núcleo do app os chama. */
export async function customerWhere(companyId: string, scope: ViewerScope): Promise<...>
export async function orderOwnerIds(companyId: string, scope: ViewerScope): Promise<string[] | null>
```

Por que isso resolve as duas coisas de uma vez: a Inteligência deixa de
disparar a consulta extra (então `mock.calls[0]` volta a ser o `loadSellers` e
o teste pré-existente passa **sem alteração**), e o núcleo do app continua
carregando a equipe exatamente uma vez, como antes.

A precedência continua a mesma e continua sendo a correção do bug:
**`company` antes de `team`**. Quem tem `intel.admin` vê tudo, mesmo que também
tenha `intel.manager`.

`orderOwnerIds` devolvendo `null` significa "sem filtro de dono" (escopo
`company`) — é mais honesto que enumerar todos os usuários ativos, porque não
esconde pedidos de usuário desativado. Veja a nota do passo 3-bis.

Casa canônica: `apps/api/src/modules/users/data-scope.ts`, que já é importado
pelo núcleo. A Inteligência passa a importar dali — ela já importa de fora do
próprio módulo (`manager.routes.ts` usa `../../permissions/permissions.service`),
então não é precedente novo.

## Quem acessa

Este plano não cria tela nem rota. Ele muda o que cada perfil enxerga nas telas
que já existem:

| Perfil | Antes | Depois |
|---|---|---|
| Vendedor | a própria carteira | **igual** |
| Gerente (`intel.manager`, sem `intel.admin`) | a equipe dele, nos dois lados | **igual** |
| Administrador (`ADMIN`/`intel.admin`) **sem** `intel.manager` | empresa inteira | **igual** |
| Administrador **com** `intel.manager` | Clientes/Pedidos vazios; Inteligência completa | **empresa inteira nos dois** |
| `SUPERADMIN` | tudo | **igual** |

Só a quarta linha muda. Ela é o bug.

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Checar tipos | `npm run type-check` | exit 0, sem erros |
| Lint | `npm run lint` | exit 0 |
| Testes da API | `npm test --workspace=apps/api` | todos passam |

## Escopo

**Dentro do escopo:**
- `apps/api/src/modules/users/data-scope.ts` (casa do resolvedor unificado)
- `apps/api/src/modules/users/__tests__/data-scope.test.ts` (criar/estender)
- `apps/api/src/modules/customers/customers.service.ts` (passar a usar os helpers novos)
- `apps/api/src/modules/orders/orders.routes.ts` (idem)
- `apps/api/src/modules/intelligence/manager/manager.service.ts` (remover o resolvedor duplicado)
- `apps/api/src/modules/intelligence/manager/manager.routes.ts` (`scopeFor` passa a delegar)
- os demais arquivos de `manager/` que importam `TeamScope`/`sellerScopeWhere`
- `apps/api/src/modules/intelligence/manager/__tests__/` (ajustar o que quebrar)

**Fora do escopo (NÃO toque):**
- Qualquer tela — nem painel, nem app. Este plano não muda nenhuma interface.
- `packages/db/prisma/schema.prisma` — sem migration. `User.managerId` e a
  permissão `intel.manager` continuam exatamente como estão.
- `apps/api/src/modules/permissions/**` — o catálogo não muda; o que muda é
  **como** as permissões são interpretadas.
- A regra de que vendedor sem gerente aparece só para o administrador (D3b,
  revista em 26/08/2026). Ela é decisão de produto e continua valendo.

## Fluxo de git

- Branch: `advisor/007-unificar-escopo-de-equipe`
- Um commit por passo. Estilo: `api: escopo de equipe unificado`.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado.

## Passos

### Passo 1 — JÁ EXECUTADO, não refaça

Commit `687cdf3`. Os testes que travam o comportamento atual já existem em
`apps/api/src/modules/users/__tests__/data-scope.test.ts`. Confirme com
`git log --oneline 6a440c8..HEAD` e siga.

### Passo 2-bis: Enxugar o `ViewerScope` para só a decisão

Os passos 2 e 3 originais já foram commitados (`ce3a032`, `fa1fafd`), mas com a
forma alvo **errada**. Corrija `apps/api/src/modules/users/data-scope.ts`:

- tire `userIds` e `vendorCodes` do tipo `ViewerScope`; o ramo `team` passa a
  ter `{ kind: 'team'; managerId: string; ownVendorCode: string | null }`;
- `resolveViewerScope` **não chama mais** `loadTeamInCompany`. Ele só resolve
  permissões e busca o próprio `idVendProt`. Pode perder o parâmetro
  `companyId`, que deixa de ser necessário ali;
- `loadTeamInCompany` continua existindo e continua filtrando por `companyId` —
  passa a ser chamado de dentro de `customerWhere` e `orderOwnerIds`;
- `customerWhere(companyId, scope)` e `orderOwnerIds(companyId, scope)` viram
  assíncronos e carregam a equipe sob demanda;
- `sellerWhere(scope)` continua **puro** e continua lendo só `managerId`.

**Verificar**: `npm run type-check` → exit 0.

### Passo 3-bis: Ajustar os dois chamadores do núcleo

`customers.service.ts` e `orders.routes.ts` passam a `await` os helpers novos.

Sobre `orders.routes.ts`: a execução anterior, para o escopo `company`, buscou
todos os usuários **ativos** da empresa e filtrou por essa lista. Isso exclui
pedidos de usuário desativado, o que não é "ver a empresa inteira". Faça
`orderOwnerIds` devolver `null` no caso `company` e o chamador **omitir** o
filtro de dono quando receber `null` — sem lista, sem exclusão acidental. Se
isso exigir tocar `orders.service.ts`, está autorizado: acrescente esse arquivo
ao escopo e diga no relatório.

Atualize `data-scope.test.ts` para a forma nova. O caso do `ADMIN` com
`intel.manager` continua esperando `{ kind: 'company' }` — essa é a correção do
bug e não muda.

**Verificar**: `npm run type-check` → exit 0; `npm test --workspace=apps/api` →
todos passam.

### Passo 4-bis: Migrar a Inteligência

Agora sim a migração é de importação, não de semântica. Comece descartando o
trabalho anterior deste passo: ele está guardado em `git stash` (mensagem
`passo4-incompleto`) e foi escrito contra a forma errada. **Não faça `stash pop`** —
refaça a partir do estado commitado.

`scopeFor` em `manager.routes.ts` passa a chamar `resolveViewerScope`. Em
`manager.service.ts`, remova `TeamScope`, `resolveTeamScope` e
`sellerScopeWhere`, e use `sellerWhere` de `data-scope.ts`. Percorra:

```
grep -rn "TeamScope\|resolveTeamScope\|sellerScopeWhere" apps/api/src --include=*.ts
```

Onde o código fazia `scope.managerId ? ... : ...`, a forma nova é
`scope.kind === 'company' ? ... : ...`.

`buildManagerHome` passa a receber o `ViewerScope` por parâmetro, com um
comentário de uma linha dizendo que a home do gerente é sempre a equipe de quem
chamou, nunca `company`, mesmo para um admin.

**O critério de sucesso deste passo é exatamente o que fez a execução anterior
parar**: `manager/__tests__/` tem que passar **sem nenhuma alteração de
asserção**. Se um teste de lá falhar, pare de novo e reporte — não ajuste
`mock.calls`.

**Verificar**: `npm run type-check` → exit 0; `npm test --workspace=apps/api` →
todos passam; `git diff --stat -- apps/api/src/modules/intelligence/manager/__tests__/`
→ no máximo a remoção do describe que testava a função removida, nenhuma
asserção alterada.

### Passo 5: Provar que sobrou um só

**Verificar**:
- `grep -rn "resolveDataScope\|resolveTeamScope" apps/api/src --include=*.ts` →
  nenhuma ocorrência fora de `data-scope.ts` (ou nenhuma, se você removeu os
  nomes antigos de vez);
- `grep -rn "intel.manager" apps/api/src --include=*.ts | grep -v __tests__` →
  a decisão de escopo acontece em **um** arquivo só.

## Plano de testes

- Novos: `apps/api/src/modules/users/__tests__/data-scope.test.ts` com os cinco
  casos do passo 1, mais um sexto: gerente da empresa A não enxerga vendedor da
  empresa B, mesmo com `managerId` apontando para ele (prova a trava nova de
  `companyId`).
- Os testes existentes em `apps/api/src/modules/intelligence/manager/__tests__/`
  têm que continuar passando sem mudança de expectativa. Se algum precisar
  mudar, **isso é um sinal de que a semântica mudou onde não devia** — pare e
  reporte antes de ajustar o teste.
- Esta é a regra mais importante deste plano: num refactor de visibilidade,
  teste que precisa ser "ajustado" costuma ser um bug sendo normalizado.

## Critérios de conclusão

- [ ] `npm run type-check` sai com 0
- [ ] `npm run lint` sai com 0
- [ ] `npm test --workspace=apps/api` passa
- [ ] Existe **um** resolvedor: o grep do passo 5 confirma
- [ ] `git diff --stat packages/db/prisma/schema.prisma` vazio
- [ ] `git diff --stat apps/web apps/mobile` vazio (nenhuma tela tocada)
- [ ] O teste do `ADMIN` com `intel.manager` espera `{ kind: 'company' }`
- [ ] Nenhum teste pré-existente de `manager/__tests__/` teve expectativa alterada
- [ ] Linha de status atualizada em `plans/README.md`

## Condições de PARADA

- Um teste pré-existente de `manager/__tests__/` falhar: significa que a
  semântica mudou num ponto que este plano não previu.
- A lista do grep do passo 4 passar de ~10 arquivos: o alcance é maior do que o
  plano estimou; reporte a lista antes de seguir.
- `getEffectivePermissions` não existir mais ou mudar de assinatura.
- Aparecer um **quarto** lugar que decide escopo de equipe, fora dos três
  descritos aqui (`data-scope.ts`, `resolveTeamScope` e `buildManagerHome`).

## Notas de manutenção

- **Depois deste plano, escopo de equipe tem um dono só.** Qualquer código novo
  — incluindo os planos 002, 003 e 005 desta série — deve importar de
  `data-scope.ts` e nunca reimplementar o filtro.
- Se 002, 003 ou 005 já tiverem sido executados, eles usam `sellerScopeWhere`:
  o passo 4 precisa migrá-los junto. Se ainda não, execute este plano antes
  deles e eles já nascem certos.
- Quem revisar deve olhar, nesta ordem: (1) a precedência `company` antes de
  `team`, que é a correção; (2) a trava de `companyId` no `loadTeam`; (3) se
  algum teste antigo foi "ajustado" — e, se foi, por quê.
- O caso `ADMIN` + `intel.manager` provavelmente nunca apareceu em produção
  porque ninguém concedeu as duas. Depois desta correção, conceder as duas passa
  a ser inofensivo — o que é o comportamento esperado por quem usa o painel.
