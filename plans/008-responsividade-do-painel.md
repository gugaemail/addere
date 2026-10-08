# Plano 008: Conter a rolagem lateral e o corte silencioso no painel

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md` — a não ser que quem despachou você tenha dito que
> mantém o índice.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat e492f51..HEAD -- apps/web/src/components/ui/Table.tsx apps/web/src/app/\(admin\)/`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P2
- **Esforço**: S
- **Risco**: LOW
- **Depende de**: nenhum
- **Categoria**: bug
- **Planejado em**: commit `e492f51`, 2026-10-07

## Por que isso importa

Três problemas distintos de layout no painel, encontrados numa varredura das 14
telas. Nenhum deles é o que parecia à primeira vista — vale ler o diagnóstico
antes de mexer, porque a correção "óbvia" de cada um estaria errada.

**1. A página é arrastada junto com a tabela, no iOS.** O sintoma relatado foi
o painel aparecendo deslocado ~20px no celular, com o título cortado. A
suspeita natural é layout estourando a largura — **não é**. Verificado no
emulador a 393 px: `/users` não vaza, e a tabela rola corretamente dentro do
próprio contêiner.

O que acontece é **scroll chaining do WebKit**: o dedo arrasta a tabela, ela
chega ao fim, e o iOS repassa o gesto para o ancestral rolável — o `<main>`,
que tem `overflow-auto` nos dois eixos. A página anda junto. O Blink do Chrome
não reproduz, por isso o emulador mostra tudo certo.

A propriedade feita exatamente para isso é `overscroll-behavior-x: contain`:
ela faz o gesto parar no contêiner em vez de escapar.

**2. `OrderDetail` corta colunas em silêncio.** A tabela de itens do pedido
está dentro de um `overflow-hidden`. O que não cabe não rola — some, sem
nenhuma indicação de que existe. É o único caso de **dado invisível** da
varredura, e o mais grave dos três: rolagem lateral incomoda, dado escondido
engana.

**3. Quatro modais com formulário em três colunas.** Sem prefixo responsivo, a
390 px cada campo fica com cerca de 100 px de largura. Não estoura a página
(o Tailwind compila `grid-cols-3` como `repeat(3, minmax(0, 1fr))`, que encolhe),
mas é inutilizável no celular.

## Estado atual

### O contêiner compartilhado de tabela

`apps/web/src/components/ui/Table.tsx:38` — serve a maioria das telas do painel:

```tsx
<div className={cn('overflow-x-auto rounded-xl', className)}>
  <table className="w-full text-sm">
```

### Os dois contêineres próprios

- `apps/web/src/app/(admin)/inteligencia/equipe/page.tsx:597` — `<div className="overflow-x-auto">`
- `apps/web/src/app/(admin)/inteligencia/resultado/page.tsx:263` — `<div className="overflow-x-auto">`

### A tabela que corta

`apps/web/src/app/(admin)/empresas/[id]/tabs/OrdersTab.tsx:39-40`:

```tsx
function OrderDetail({ order }: { order: CompanyOrder }) {
  return (
    <div className="rounded-lg border border-[var(--border)] overflow-hidden mt-1">
      <table className="w-full text-xs">
```

O `overflow-hidden` ali existe para o `rounded-lg` recortar os cantos da
tabela. Trocar por rolagem **sem** cuidado perde esse arredondamento — veja o
passo 2.

### Os quatro grids de modal

`apps/web/src/app/(admin)/empresas/[id]/EntityModals.tsx`, linhas **163**,
**173**, **414** e **548**, todas idênticas:

```tsx
<div className="grid grid-cols-3 gap-3">
```

### O que já está certo e NÃO deve ser mexido

- `apps/web/src/app/(admin)/layout.tsx:363` — a coluna de conteúdo tem
  `min-w-0`, que é o que impede o flex de estourar. Correto.
- `apps/web/src/app/(admin)/layout.tsx:385` — `<main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">`.
  **Não troque por `overflow-x-hidden`.** Seria tapar o sintoma: qualquer
  conteúdo que um dia estoure passaria a ser cortado em silêncio, que é
  exatamente o defeito do item 2 deste plano.
- `apps/web/src/app/(admin)/inteligencia/consultas/[name]/page.tsx:608` — a
  tabela com `min-w-[640px]` está dentro de um `max-h-80 overflow-auto`, que
  cobre os dois eixos. Já funciona.

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Gerar o client | `npm run db:generate` | exit 0 (sem banco) |
| Tipos do monorepo | `npm run types:build` | exit 0 |
| Checar tipos | `npm run type-check` | exit 0, sem erros |
| Lint | `npm run lint` | exit 0 |
| Build do painel | `npm run build:web` | exit 0 |

`npm run build:web` exige `apps/web/.env.local` (cópia de `.env.local.example`);
sem ele o build falha em `/inteligencia/saude` com "NEXT_PUBLIC_API_URL não está
definida". O arquivo é ignorado pelo git.

## Escopo

**Dentro do escopo:**
- `apps/web/src/components/ui/Table.tsx`
- `apps/web/src/app/(admin)/inteligencia/equipe/page.tsx` (só a linha 597)
- `apps/web/src/app/(admin)/inteligencia/resultado/page.tsx` (só a linha 263)
- `apps/web/src/app/(admin)/empresas/[id]/tabs/OrdersTab.tsx`
- `apps/web/src/app/(admin)/empresas/[id]/EntityModals.tsx`

**Fora do escopo (NÃO toque):**
- `apps/web/src/app/(admin)/layout.tsx` — ver "o que já está certo" acima.
- `apps/mobile/**` e `apps/api/**` — este plano é só do painel.
- `apps/web/src/app/(admin)/inteligencia/consultas/[name]/page.tsx` — já tem
  contêiner que funciona.
- Qualquer outro `grid-cols-N` do painel. Os de `equipe/page.tsx:526,531` e
  `saude/page.tsx:179` foram conferidos e estão adequados ao conteúdo deles.

## Fluxo de git

- Branch: `fix/responsividade-do-painel` (já criada pelo despachante)
- Um commit por passo. Estilo: `web: <o que mudou>`.
- NÃO faça push e NÃO abra PR.

## Passos

### Passo 1: Conter o gesto nos contêineres de rolagem

Acrescente `overscroll-x-contain` aos três contêineres, junto do
`overflow-x-auto` que já existe:

- `components/ui/Table.tsx:38`
- `inteligencia/equipe/page.tsx:597`
- `inteligencia/resultado/page.tsx:263`

No `Table.tsx`, mantenha o `cn(...)` e o `className` recebido como estão — a
classe nova entra na string literal, antes do `className`.

Ponha um comentário de uma linha **só no `Table.tsx`** (é o compartilhado)
explicando o porquê: sem isso o iOS repassa o gesto para o `<main>` quando a
tabela chega ao fim, e a página inteira desliza.

**Verificar**: `npm run type-check` → exit 0;
`grep -rn "overscroll-x-contain" apps/web/src` → exatamente três ocorrências.

### Passo 2: Fazer o `OrderDetail` rolar em vez de cortar

Em `OrdersTab.tsx:39`, o `overflow-hidden` serve para o `rounded-lg` recortar os
cantos da tabela. Se você simplesmente trocar por `overflow-x-auto`, o
arredondamento se perde.

Mantenha os dois: a borda arredondada fica no `div` externo, e a rolagem entra
num `div` interno que envolve só a `<table>`:

```tsx
<div className="rounded-lg border border-[var(--border)] overflow-hidden mt-1">
  <div className="overflow-x-auto overscroll-x-contain">
    <table className="w-full text-xs">
```

Feche o `div` novo no lugar certo — logo depois do `</table>`, antes do
`</div>` externo.

**Verificar**: `npm run type-check && npm run lint` → exit 0;
`grep -n "overflow-x-auto" apps/web/src/app/\(admin\)/empresas/\[id\]/tabs/OrdersTab.tsx`
→ uma ocorrência.

### Passo 3: Os quatro grids de modal viram responsivos

Nas linhas **163**, **173**, **414** e **548** de `EntityModals.tsx`, troque:

```tsx
<div className="grid grid-cols-3 gap-3">
```

por:

```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
```

Uma coluna no celular, três a partir de `sm` (640 px). **São exatamente quatro
ocorrências** — confira que não sobrou nenhuma e que você não mexeu em nenhum
`grid-cols-2` do arquivo, que estão fora do escopo.

**Verificar**:
`grep -c "grid-cols-1 gap-3 sm:grid-cols-3" apps/web/src/app/\(admin\)/empresas/\[id\]/EntityModals.tsx`
→ `4`;
`grep -c "\"grid grid-cols-3 gap-3\"" apps/web/src/app/\(admin\)/empresas/\[id\]/EntityModals.tsx`
→ `0`.

### Passo 4: Build

**Verificar**: `npm run build:web` → exit 0.

## Plano de testes

Não há teste automatizado a escrever. O repositório não testa layout do painel,
e não existe harness de render para as páginas (`apps/web` só tem testes de
funções puras em `src/lib/__tests__/`). Inventar um aqui seria introduzir uma
ferramenta nova a pretexto de três mudanças de classe CSS.

A verificação é a dos greps de cada passo, mais o build. O que não dá para
automatizar — o gesto de arrastar no iOS — fica como conferência manual de quem
revisa, e está anotada nos critérios abaixo.

## Critérios de conclusão

- [ ] `npm run type-check` sai com 0
- [ ] `npm run lint` sai com 0
- [ ] `npm run build:web` sai com 0
- [ ] `grep -rn "overscroll-x-contain" apps/web/src` retorna **quatro**
      ocorrências (três do passo 1 + a do passo 2)
- [ ] `grep -c "\"grid grid-cols-3 gap-3\"" .../EntityModals.tsx` retorna `0`
- [ ] `git diff --stat e492f51..HEAD -- apps/web/src/app/\(admin\)/layout.tsx`
      vazio — o `<main>` não foi tocado
- [ ] `git diff --stat e492f51..HEAD -- apps/mobile apps/api packages` vazio
- [ ] Linha de status atualizada em `plans/README.md`

## Condições de PARADA

- O `<main>` do layout precisar de mudança para algum passo funcionar — não
  precisa, e mexer nele é a correção errada.
- Algum dos três contêineres do passo 1 não existir mais com o `overflow-x-auto`
  citado.
- `EntityModals.tsx` tiver número de `grid-cols-3` diferente de quatro.
- O passo 2 quebrar o arredondamento dos cantos da tabela — se não der para
  manter borda e rolagem juntas, reporte em vez de escolher um dos dois.

## Notas de manutenção

- **A regra que fica**: todo contêiner com `overflow-x-auto` no painel leva
  `overscroll-x-contain` junto. São pares. Quem acrescentar uma tabela nova que
  use o `Table.tsx` compartilhado já ganha os dois de graça.
- **O que foi conferido e não é problema**, para ninguém reauditar: os
  `grid-cols-N` restantes do painel (o Tailwind usa `minmax(0, 1fr)`, que
  encolhe em vez de estourar); as cinco tabelas do painel, que têm contêiner de
  rolagem; o CSS global, sem regra de largura em `html`/`body`; e a ausência de
  `100vw`, `w-screen` ou margem negativa grande.
- Quem revisar deve olhar com lupa o passo 2: é fácil fechar o `div` novo no
  lugar errado e deixar a paginação ou o rodapé dentro da área de rolagem.
