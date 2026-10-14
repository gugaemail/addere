# Plano 012: Blindar o agente contra os erros que ele já pode cometer hoje

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 3bf3acd..HEAD -- apps/api/src/modules/intelligence/agent/ apps/api/src/modules/intelligence/eval/ apps/api/src/modules/intelligence/app/messages.routes.ts apps/api/src/modules/intelligence/app/customers.routes.ts apps/api/src/modules/intelligence/manager/losses.service.ts apps/api/src/modules/intelligence/admin/health.service.ts`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: L (quatro ondas independentes; cada uma vira um PR)
- **Risco**: MEDIUM — mexe no caminho de toda chamada ao modelo; a onda 2 tem migration
- **Depende de**: nenhum
- **Categoria**: hardening
- **Planejado em**: commit `3bf3acd` (`origin/staging`), 2026-10-14

## Por que isso importa

O "agente" do Addere é um serviço só (`agent/agent.service.ts`,
`generateWithGuardrails`) chamado por seis tipos de texto: `today` e `week` (job
`PLAN`), `briefing` e `portfolio` (app do vendedor), `message` (WhatsApp que vai
**para o cliente**) e `losses` (tela do gerente). A proteção foi bem desenhada —
allowlist de fatos, pseudônimos, self-check com uma regeneração, queda para o
texto do motor —, mas o levantamento abaixo achou buracos de três tipos:

1. **O texto pode estar errado e passar.** Hoje o caminho mais perigoso nem
   passa pelo modelo: é o **cache**, que devolve texto escrito para outros fatos
   e reidrata os pseudônimos com o mapa da requisição atual. Resultado possível:
   o número de um cliente aparece com o nome de outro, ou o gerente lê a
   análise de perdas da equipe de outro gerente.
2. **O agente pode parar de funcionar sem ninguém ver.** Já aconteceu duas
   vezes (o Hoje em só-motor desde a v1 por causa do rodapé de frescor; cinco
   dias com zero chamadas entre 25 e 30/09 por causa do padrão de CEP). As
   falhas das rotas sob demanda não são registradas em lugar nenhum, e o painel
   de custo mostra cerca de um dia, não o mês.
3. **O eval pode dar verde sem testar.** Ele aceita resposta do cache como
   aprovação, não percebe troca de modelo nem de prompt por tipo, e nunca
   compara o resultado com o `expected` que ele mesmo congela.

## Levantamento — o que pode dar errado

Gravidade: **ALTA** = informação errada ou indevida chega a uma pessoa;
**MÉDIA** = texto pior que o necessário, custo ou proteção enganosa;
**BAIXA** = incômodo.

### A. Texto errado chegando ao usuário

| # | Erro | Gravidade | Onde | Proteção hoje | Passo |
|---|------|-----------|------|---------------|-------|
| A1 | **Número de um cliente com o nome de outro.** O cache guarda o texto com pseudônimos (`C1`, `C2`…) e é chaveado pelo alvo, não pelos fatos. Se a ordem dos clientes muda (REFRESH no meio do dia, plano regerado, job PLAN rodado de novo à mão), o cache devolve o texto antigo e o `rehydrate` troca `C1` pelo **novo** C1. | ALTA | `agent.service.ts:56-68`; chaves em `customers.routes.ts:466` (carteira, `today`), `plan-summary.job.ts` (`today`), `losses.service.ts:222` | nenhuma — self-check não roda no acerto de cache | 1 |
| A2 | **Gerente lê a análise de perdas de outra equipe.** Sem `vendorCode` no filtro, a chave é `'*'`, mas o relatório é recortado pelo escopo de quem pede (`sellerWhere(scope)`). O primeiro gerente do dia grava; os outros recebem o texto dele, reidratado com nomes da própria equipe. | ALTA | `losses.service.ts:222` | nenhuma | 1 |
| A3 | **Texto velho contradiz os sinais novos.** Briefing e mensagem ficam 4 h no cache por cliente. Pedido fechado, título pago ou cliente **bloqueado** depois da primeira geração não mudam o texto; a tela mostra os sinais novos ao lado do texto velho. Tom do vendedor também não entra na chave da mensagem. | ALTA | `customers.routes.ts:306`, `messages.routes.ts:133` | nenhuma | 1 |
| A4 | **Mensagem de venda para cliente bloqueado.** A rota de mensagem não olha o status: se o modelo falha ou está desligado, o `fallbackMessage` manda "Fechamos essa semana?" / "Posso montar o pedido" — pelo WhatsApp, para o cliente. A regra do bloqueado só existe no self-check do texto do modelo. | ALTA | `messages.routes.ts:30-46` e `:155` | nenhuma no fallback | 2 |
| A5 | **Modelo acha que o cliente não deve nada.** A rota de mensagem e o eval montam o snapshot com `openTitles: { count: 0, … }` fixo, mesmo para cliente bloqueado por título vencido. O briefing carrega os títulos de verdade (`loadSnapshot`), os outros dois não. | MÉDIA | `messages.routes.ts:104`, `eval.service.ts:53` | nenhuma | 3 |
| A6 | **"Confiança" inventada.** O briefing pede uma linha de confiança, mas `buildCustomerFacts` não envia `signal.confidence` (nem está na allowlist). O modelo chuta "alta/média/baixa". | MÉDIA | `facts.ts:108-137`, `prompts/briefing.ts:10-13` | nenhuma | 3 |
| A7 | **Rodapé de frescor falso.** A regra 6 do skill manda terminar **sempre** com a linha de frescor; briefing, carteira e perdas mandam `lastSyncAt: null`. Se o modelo obedece ao skill, escreve "Dados sincronizados: sem sincronização ainda" para um tenant sincronizado há minutos — e o self-check desconta essa linha da varredura. | MÉDIA | `skill-prompt.ts:13`, `customers.routes.ts:308`, `self-check.ts:79` | nenhuma | 3 |
| A8 | **Perdas trata cliente sem sinal como em dia.** Status ausente vira `'ON_CYCLE'`, o que desliga a regra do bloqueado para ele. | MÉDIA | `losses.service.ts:189` | nenhuma | 2 |
| A9 | **Self-check com furos conhecidos.** (a) Número certo no cliente errado passa — os números são um saco único, sem dono. (b) Número por extenso ("três clientes") não é extraído. (c) Produto inventado não é checado, apesar da regra 1 do skill. (d) Regra do bloqueado só olha frases com o pseudônimo — "Ele está bloqueado. Ofereça a linha nova." passa. (e) `SALE_ACTION` não pega "repor", "reposição", "lançamento", "desconto", "montar o pedido". (f) `CYCLE_CLAIM` só pega "compra a cada N dias" — "costuma comprar todo mês" passa. | MÉDIA | `self-check.ts:30-31`, `:51-62`, `:86-104` | parcial | 6 |
| A10 | **Mensagem ao cliente com cara de sistema.** O texto que vai para o WhatsApp pode citar `AT_RISK`, segmento RFM ("LOST"), "ticket médio", "títulos vencidos" ou passar de 400 caracteres sem pergunta no fim — nada disso é checado. | MÉDIA | `prompts/message.ts`, `messages.routes.ts:129-155` | só o prompt | 6 |
| A11 | **Pseudônimo cru na tela.** Se o modelo escreve um `Cn` que não está no mapa (ou "c1"), o `rehydrate` deixa como está. A mensagem usa um `replace` próprio só para `C1`. | BAIXA | `pseudonymizer.ts:25-31`, `messages.routes.ts:152` | self-check pega `Cn` inventado, não caixa baixa | 6 |

### B. Falha silenciosa e custo

| # | Erro | Gravidade | Onde | Proteção hoje | Passo |
|---|------|-----------|------|---------------|-------|
| B1 | **Queda para só-motor sem alarme.** O job PLAN conta motivos em `metadata`; briefing, mensagem, carteira e perdas não registram nada além de `facts_leak` no Sentry. Foi exatamente assim que os dois incidentes passaram dias sem ser vistos. | ALTA | `agent.service.ts:107-122`, `:165` | só no PLAN | 4, 5 |
| B2 | **Teto diário de tokens subconta.** Só a geração aprovada grava linha; tentativa reprovada no self-check (até 2 chamadas) e erro de JSON gastam e não contam. E o `upsert` **substitui** os tokens da mesma chave — o mesmo briefing gerado 3× no dia conta 1×. | MÉDIA | `agent.service.ts:126-160` | parcial | 4 |
| B3 | **Painel "uso de LLM no mês" mostra ~1 dia.** Lê `intel_llm_cache`, que o PURGE apaga quando expira (4 h). Também ignora `cacheCreationTokens`. | MÉDIA | `admin/health.service.ts:205-210`, `jobs/purge.ts:25` | nenhuma | 4 |
| B4 | **Resposta truncada ou recusada vira "JSON inválido".** `stop_reason` (`max_tokens`, `refusal`) não é lido; com thinking adaptativo e `MAX_TOKENS = 2000`, truncamento é possível e indistinguível de outro erro. O JSON é só `as T`, sem conferir o formato. | BAIXA | `client.ts:70-80` | o SDK + structured output | 7 |

### C. Eval que aprova sem testar

| # | Erro | Gravidade | Onde | Proteção hoje | Passo |
|---|------|-----------|------|---------------|-------|
| C1 | **Verde vindo do cache.** O eval passa pelo `generateWithGuardrails`, com cache de 4 h; segunda rodada na janela conta `source: 'cache'` como PASS sem chamar o modelo. | ALTA | `eval.service.ts:124`, `:134` | nenhuma | 8 |
| C2 | **Troca de modelo ou de prompt por tipo não muda a versão.** `promptVersion()` é hash só do `AGENT_SKILL` — mudar `INTEL_LLM_MODEL`, `buildBriefingPrompt` ou o schema dá a mesma versão, e (junto com C1) o mesmo cache. | ALTA | `tenant-context.ts:12-14` | nenhuma | 8 |
| C3 | **`expected` congelado e nunca lido.** O critério é "passou no self-check"; ninguém confere se o bloqueado recebeu "resolver pendência" ou se o mix cortado foi citado. | MÉDIA | `eval.service.ts:67` vs `:134` | nenhuma | 8 |
| C4 | **Regeneração mascara regressão; só o briefing é testado.** Um prompt que erra de primeira e acerta na segunda passa igual — e custa o dobro em produção. A mensagem, que vai para o cliente, não tem eval. | MÉDIA | `eval.service.ts:120-133` | nenhuma | 8 |

**Fora do levantamento, de propósito:** injeção de prompt por texto do
Protheus (`productDesc`) ou pelo DADOS.md do admin. O risco existe, mas a saída
é presa a schema e passa pelo self-check, e quem escreve o DADOS.md já é admin
do tenant. Fica anotado, não entra neste plano.

## Ordem de execução — quatro ondas, um PR cada

| Onda | Passos | O que resolve | Migration? | Toca o app? |
|------|--------|---------------|------------|-------------|
| 1 — texto errado hoje | 1, 2, 3 | A1–A8 | não | não (ver PARADA do passo 2) |
| 2 — enxergar e contar | 4, 5 | B1–B3 | **sim** (`IntelLlmCall`) | não |
| 3 — self-check mais duro | 6, 7 | A9–A11, B4 | não | não |
| 4 — eval que reprova | 8 | C1–C4 | não | não |

A onda 1 vem primeiro porque é a única com erro que chega a uma pessoa hoje e é
pequena. A onda 2 vem antes da 3 porque o registro de chamadas é o que vai dizer
se o self-check mais duro está derrubando texto bom (taxa de só-motor por
motivo).

Cada PR vai direto para `staging` (lição do incidente do #171 no README).

---

## Passo 1 — Cache pela entrada, não pelo alvo (A1, A2, A3)

**Estado atual** — `agent.service.ts:56-68`:

```ts
const cached = await prisma.intelLlmCache.findUnique({
  where: { companyId_kind_vendorCode_targetKey: { …, targetKey: input.targetKey } },
})
if (cached && cached.expiresAt > new Date()) {
  return { data: cached.payload as T, source: 'cache' }
}
```

**O que fazer**

1. Em `generateWithGuardrails`, calcule um hash da entrada completa:
   `sha256(JSON.stringify({ model: env.INTEL_LLM_MODEL, system: input.system.map(b => b.text), user: input.userPrompt, schema: input.schema }))`,
   16 primeiros caracteres hex. O `userPrompt` já contém o JSON dos fatos com
   os pseudônimos na ordem em que foram atribuídos — fatos iguais na mesma ordem
   ⇒ mesmo mapa ⇒ reidratar é seguro.
2. Use `${input.targetKey}#${hash}` como `targetKey` efetivo na leitura **e** na
   gravação. Não precisa de migration: a coluna é `String`, o unique continua o
   mesmo, e o PURGE já apaga o que expira.
3. Acrescente `cache?: boolean` (padrão `true`) ao `GenerateInput`; com `false`,
   não lê nem grava cache (o eval vai usar no passo 8).
4. Não mexa nos `targetKey` das chamadas — eles continuam úteis para leitura
   humana da tabela.

**Testes** (`agent/__tests__/agent.service.test.ts`, com o client fake já
existente):

- mesmo alvo, fatos diferentes ⇒ duas chamadas ao modelo;
- mesmo alvo, fatos iguais ⇒ uma chamada e `source: 'cache'` na segunda;
- dois `userPrompt` com os mesmos clientes em ordem trocada ⇒ duas chamadas;
- `cache: false` ⇒ nenhuma leitura nem gravação em `intelLlmCache`.

**Verificação**: `npm test -w @addere/api -- agent` verde;
`grep -n "targetKey" apps/api/src/modules/intelligence/agent/agent.service.ts`
mostra o sufixo de hash na leitura e na gravação.

---

## Passo 2 — Bloqueado é barrado antes do modelo, não só depois (A4, A8)

**O que fazer**

1. `messages.routes.ts`: depois de carregar o `snapshot`, se
   `snapshot.status === 'BLOCKED'`, **não gere** mensagem (nem modelo, nem
   `fallbackMessage`): responda `422` com
   `{ message: 'Cliente bloqueado — resolva a pendência antes de ofertar' }`.
   Coerente com a regra do plano 010: bloqueado aparece, mas não recebe pedido.
2. Confira também o bloqueio de cadastro (`A1_MSBLQL`, plano 010): se ele não
   se reflete em `customerSignal.status`, use o mesmo campo que o seletor de
   cliente do 010 usa.
3. `losses.service.ts:189`: troque o padrão `'ON_CYCLE'` por uma consulta ao
   `customerSignal` dos clientes que faltarem no mapa; se ainda faltar, use
   `'UNKNOWN'` (o self-check não aplica regra nenhuma a ele, mas também não
   finge que está em dia).

**Testes**: rota de mensagem com cliente `BLOCKED` ⇒ 422 e **nenhuma** linha em
`customerMessage`; perdas com cliente sem sinal ⇒ status `UNKNOWN` nos fatos.

**PARADA**: antes de mudar, abra a tela de mensagem do app
(`apps/mobile`, busque por `messages`) e confirme que um 422 mostra o
`message` da API ao vendedor. Se o app mostrar erro genérico ou travar, **pare**
— a decisão entre "422 + ajuste no app" e "mensagem neutra sem oferta" é de
produto (Gustavo).

---

## Passo 3 — Fatos completos e verdadeiros (A5, A6, A7)

1. Mova `loadSnapshot` de `customers.routes.ts:62` para
   `agent/snapshot.ts` (exportado) e use-o em `messages.routes.ts` (no lugar do
   snapshot montado à mão com títulos zerados) e em `eval.service.ts`
   (`freezeEvalCases` — o caso congela com os títulos reais da época).
2. Confiança: acrescente `confidence` a `CustomerFacts`, a `buildCustomerFacts`
   e a `ALLOWED_FACT_KEYS`. No `buildBriefingPrompt`, troque a instrução por
   "Confiança: use o campo `confidence` dos fatos e diga por quê em poucas
   palavras". O mapeamento do enum para "alta/média/baixa" fica no prompt.
3. Frescor: em `skill-prompt.ts`, a regra 6 passa a ser
   "Quando o prompt pedir a linha de frescor, termine com ela exatamente como
   fornecida." (o Hoje continua pedindo explicitamente em `prompts/today.ts:32`).
   Isso muda o `promptVersion` — esperado; rode o eval depois (passo 8 ou o
   atual, se a onda 4 ainda não estiver feita).

**Testes**: `facts.test.ts` cobre `confidence` na allowlist; teste da rota de
mensagem com cliente com título em aberto ⇒ fatos com `openTitles.count > 0`;
`prompts.test.ts` sem a regra "SEMPRE".

**Verificação**: `grep -rn "openTitles: { count: 0" apps/api/src --include=*.ts`
só aparece em `__tests__`.

---

## Passo 4 — Registrar toda chamada (B1, B2, B3) — **com migration**

1. Modelo novo em `packages/db/prisma/schema.prisma`:

   ```prisma
   model IntelLlmCall {
     id                  String   @id @default(uuid())
     kind                String
     vendorCode          String
     source              String   // 'llm' | 'cache' | 'engine'
     reason              String?  // motivo do só-motor, números trocados por N
     attempts            Int      @default(0) // chamadas feitas ao modelo (0, 1 ou 2)
     inputTokens         Int      @default(0)
     outputTokens        Int      @default(0)
     cacheReadTokens     Int      @default(0)
     cacheCreationTokens Int      @default(0)
     model               String?
     latencyMs           Int?
     promptVersion       String
     createdAt           DateTime @default(now())

     companyId String
     company   Company @relation(fields: [companyId], references: [id])

     @@index([companyId, createdAt])
     @@map("intel_llm_calls")
   }
   ```

   Sem payload, sem texto, sem código de cliente — nada de LGPD aqui.
2. `generateWithGuardrails` grava **uma linha em cada saída** (cache, cada tipo
   de só-motor, sucesso), somando os tokens de **todas** as tentativas, inclusive
   as reprovadas. Gravação em `try/catch` com `captureError`: registro nunca
   derruba a geração.
3. `dailyTokensUsed` passa a somar de `intelLlmCall` (inputs + outputs +
   cacheCreation), excluindo `vendorCode = 'eval'`.
4. `health.service.ts:205-210`: "uso de LLM no mês" passa a ler de
   `intelLlmCall` e incluir `cacheCreationTokens`.
5. PURGE: apaga `intelLlmCall` com mais de 90 dias.
6. Migration **por último, em commit separado**, pelo procedimento de
   `docs/intelligence/README.md` (delta contra Postgres local — nunca
   `--from-empty`).

**Testes**: self-check reprovado duas vezes ⇒ uma linha `source: 'engine'`,
`attempts: 2`, tokens das duas; acerto de cache ⇒ linha com `attempts: 0`;
`dailyTokensUsed` conta tentativas reprovadas.

---

## Passo 5 — Alarme de silêncio (B1)

1. `health.service.ts`: por `kind`, nas últimas 24 h e 7 dias — chamadas,
   % `llm` / `cache` / `engine` e os 3 motivos mais comuns. Mostre na tela
   `/inteligencia/saude` do painel (componentes existentes; sem cor hardcoded).
2. Fim do job PLAN (`plan-summary.job.ts:135`): se `llmAvailable()`,
   `plans.length > 0` e `generated === 0`, `captureError` com os `reasons` —
   é a assinatura exata dos dois incidentes.
3. No `nightly`, para cada empresa com LLM ligado: se nas últimas 24 h houve
   ≥ 10 chamadas e mais de 50 % foram `engine`, `captureError` com a
   distribuição de motivos.

**Verificação**: teste do job PLAN com o client fake sempre reprovando ⇒
`captureError` chamado uma vez.

---

## Passo 6 — Self-check mais duro (A9, A10, A11)

Comece pelo corpus, depois mude o código até ele passar.

1. **Corpus adversarial** — `agent/__tests__/self-check.corpus.test.ts`, duas
   listas: textos que **têm** de reprovar (um por furo do A9/A10/A11, escritos
   como o modelo escreveria) e textos que **têm** de passar (respostas boas
   reais — tire 10 a 15 do `intel_llm_cache` de staging, já pseudonimizadas).
   O corpus é o critério: regra nova que derrube texto bom não entra.
2. **Número com dono**: `SelfCheckCustomer` ganha `numbers?: number[]`; em
   frase que cita **um** pseudônimo só, cada número tem de casar com os números
   desse cliente ou com os globais (`SelfCheckFacts.numbers`). Campo opcional —
   chamadas antigas continuam valendo. Preencha nos seis pontos de chamada.
3. **Número por extenso**: `extractNumbers` reconhece de "dois" a "vinte" e as
   dezenas ("trinta"… "noventa"). "um/uma" fica de fora (artigo).
4. **Produto**: `SelfCheckFacts.productCodes?: string[]`; qualquer token com o
   formato de código de produto do tenant que não esteja na lista reprova.
   Descrição inventada não é detectável por regex — fica para o eval (passo 8).
5. **Cliente único** (`briefing`, `message`): as regras de BLOCKED e NEW valem
   para o texto inteiro, não só para frases com o pseudônimo (fecha o furo do
   pronome). Parâmetro `singleCustomer: true` em `SelfCheckFacts`.
6. **Regex mais largas**: `SALE_ACTION` + `rep[oô]r|reposi[çc][aã]o|lan[çc]amento|desconto|promo\w*|montar o pedido|garantir`;
   `CYCLE_CLAIM` + `ciclo de \d+ dias|todo m[eê]s|toda semana|costuma comprar|rep[oõ]e a cada`.
   Cada termo novo precisa de um caso no corpus que reprova e não pode derrubar
   nenhum texto bom.
7. **Texto para o cliente** (`kind === 'message'`): reprova se tiver mais de 400
   caracteres, não terminar em `?`, ou contiver termo interno — os valores do
   enum de status, os segmentos RFM, `RFM`, `pseudônimo`, `ticket médio`,
   `segmento`, `bloquead`, `inadimpl`, `vencid`.
8. **Depois de reidratar**: em todos os pontos de chamada, se sobrar
   `/\bc\d+\b/i` no texto final, descarte e use o fallback. Troque o `replace`
   próprio da mensagem (`messages.routes.ts:152`) pelo `pseudonymizer.rehydrate`.
9. `homeLine` com mais de 140 caracteres reprova.

**Verificação**: corpus verde; `npm test -w @addere/api` verde. Depois do deploy,
acompanhe a tela de saúde do passo 5 por 3 dias: se a taxa de só-motor de algum
`kind` subir mais de 15 pontos, o motivo dominante diz qual regra ajustar.

---

## Passo 7 — Resposta íntegra do client (B4)

1. `client.ts`: depois da resposta, `stop_reason === 'max_tokens'` ⇒
   `{ ok: false, error: 'resposta truncada' }`; `'refusal'` ⇒ `'recusa do modelo'`.
2. Conferência mínima do JSON contra o schema (chaves `required` presentes, tipo
   `string`/`array`, `maxItems`) — função pura em `agent/schema-check.ts`, sem
   biblioteca nova. Falhou ⇒ `'formato fora do schema'`.
3. **Não mude `MAX_TOKENS`** neste plano: primeiro meça a taxa de
   `resposta truncada` no registro do passo 4.

---

## Passo 8 — Eval que reprova de verdade (C1–C4)

1. **Versão**: `promptVersion()` passa a ser o hash de `AGENT_SKILL` + todos os
   schemas + a saída de cada `build*Prompt` sobre um fixture fixo + `env.INTEL_LLM_MODEL`.
   Trocar modelo ou qualquer prompt muda a versão.
2. **Sem cache**: o eval chama com `cache: false` (passo 1).
3. **Primeira tentativa conta**: `GenerateOutput` ganha `attempts`; o resumo do
   eval separa `passedFirst`, `passedRetry` e `failed`.
4. **Ler o `expected`**, por caso:
   - `status = BLOCKED` ⇒ `whatToDo` cita pendência
     (`/pend[êe]ncia|t[íi]tulo|financeir|cadastro|limite/i`) e não tem ação de venda;
   - `hasCutMix` ⇒ `whatHappened` ou `whatToDo` cita código ou descrição de um
     item do `cutMix`;
   - `status = NEW` ⇒ `confidence` não diz "alta".
5. **Mensagem no eval**: congele também 2 casos por `situation` (6 no total) e
   rode o prompt `message` com as regras do passo 6.7.
6. **Critério de aprovação**, escrito em `docs/intelligence/README.md` (seção
   "Eval do agente"): zero `FAIL` em casos `BLOCKED`, `passedFirst` ≥ 90 %, e
   rodar o eval é obrigatório antes de mudar `INTEL_LLM_MODEL`, o skill ou
   qualquer `prompts/*.ts`.

**Verificação**: rodar `intel:eval` duas vezes seguidas com chave ⇒ as duas
rodadas chamam o modelo (`attempts ≥ 1` em todos os casos no `intel_llm_calls`).

---

## Condições de PARADA

- Checagem de deriva acusa mudança no escopo e o "Estado atual" não bate.
- Passo 2: o app não mostra a mensagem do 422 (decisão de produto).
- Passo 4: a migration gerada contém qualquer coisa além de `intel_llm_calls`
  (sinal de que o schema local divergiu).
- Passo 6: alguma regra nova derruba um texto bom do corpus e não há ajuste
  de regex que resolva sem abrir o furo de novo — reporte o par de textos.
- Qualquer passo exige mandar ao modelo um campo fora da allowlist.

## Fora de escopo

- Trocar de modelo ou mexer em `effort`/`MAX_TOKENS` (só depois de medir).
- Juiz por LLM no eval — o eval determinístico do passo 8 vem antes.
- Injeção de prompt via `productDesc` / DADOS.md (ver nota no levantamento).
- Qualquer tela nova no app.

## Verificação final

- `npm run type-check`, `npm run lint`, `npm test` na raiz: exit 0.
- `grep -rn "'ON_CYCLE'" apps/api/src/modules/intelligence/manager/losses.service.ts` vazio.
- `grep -rn "openTitles: { count: 0" apps/api/src --include=*.ts` só em testes.
- Na staging, depois do deploy da onda 2: `intel_llm_calls` recebendo linhas de
  todos os seis `kind`, e a tela de saúde mostrando a distribuição.
