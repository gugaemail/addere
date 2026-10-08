# Planos de implementação

Gerados pela skill improve em 2026-10-06, contra o commit `6a440c8`.

Tema comum: fechar o ciclo entre **o que o motor mandou fazer** e **o que
aconteceu de verdade**. Hoje o Addere planeja bem e mede mal — o dado da
execução é coletado inteiro e lido quase nunca.

Execute na ordem abaixo, salvo quando as dependências disserem outra coisa.
Cada executor: leia o plano inteiro antes de começar, respeite as condições de
PARADA e atualize a sua linha ao terminar.

## Ordem de execução e status

**Decisão de entrega (06/10/2026): um build só, no fim.** Nada de publicar o app
a cada plano. Os três primeiros não encostam em `apps/mobile`; os quatro últimos
encostam, e o build sai **uma vez**, depois do 004. Deploy de API e de painel
continua acontecendo plano a plano — esses são baratos e independentes.

### Fase 1 — sem build: só API e painel — **MERGEADA NA `main` em 07/10/2026**

| Plano | Título | Prioridade | Esforço | Toca o app? | Depende de | Status |
|-------|--------|------------|---------|-------------|------------|--------|
| 007 | Unificar os dois mecanismos de escopo de equipe | P1 | M | não | — | **DONE** |
| 001 | Dar tela às métricas de conversão que já existem na API | P1 | S | não | — | **DONE** |
| 002 | Fazer o `noOrderReason` sair do banco e virar informação | P1 | M | não | — | **DONE** |

### Fase 2 — CONCLUÍDA e **no ar** desde 07/10/2026

| Plano | Título | Prioridade | Esforço | O que muda no app | Depende de | Status |
|-------|--------|------------|---------|-------------------|------------|--------|
| 006 | Fazer o pedido valer como check-in | P1 | M | comportamento, nenhuma tela | — | **DONE** |
| 005 | Dar ao gerente a carteira da equipe com os sinais da Inteligência | P1 | M | **tela nova** + bloco na home do gerente | — | **DONE** |
| 003 | Devolver ao vendedor o histórico do próprio trabalho (e ao gerente, o da equipe) | P2 | L | **tela nova** em Rota | — | **DONE** |
| 004 | Medir a conversão em reais, não só em "comprou ou não" | P2 | L | nenhuma (passo 1 já feito pelo 006) | 001, 006 | **DONE** |
| 008 | Conter a rolagem lateral e o corte silencioso no painel | P2 | S | não | — | **DONE** |

**Nenhum executor publica build.** Ao terminar um plano da fase 2, pare no
código: o build é um passo de operação, manual, depois que os quatro estiverem
na branch.

A numeração é de criação; a ordem acima é de execução. O **007 vem primeiro**
porque é refactor de visibilidade — feito antes, os planos 002, 003 e 005 já
nascem usando um resolvedor só; feito depois, ele tem que migrar o código deles
junto. O **006 abre a fase 2** porque conserta a origem do dado que o 004 lê, e
é o único plano com migration.

### Fase 3 — sync incremental (planejada em 08/10/2026)

| Plano | Título | Prioridade | Esforço | Toca o app? | Depende de | Status |
|-------|--------|------------|---------|-------------|------------|--------|
| 009 | Sincronizar só o que mudou no Protheus (`S_T_A_M_P_`) | P1 | L | não | — (pré-requisito de ambiente conferido no piloto) | **DONE** |
| 010 | Cliente bloqueado aparece como Bloqueado e não recebe pedido | P1 | M | **sim** (seletor de cliente e selo) | — (combina com o 009) | **DONE** |

O passo 1 do 009 corrige sozinho um bug ativo — bloqueio por título vencido
nunca dispara com a consulta de referência da SE1 — e pode ir ao ar antes do
resto.

**Regras confirmadas em 08/10/2026** (valem para os dois planos): bloqueado =
`A1_MSBLQL='1'` — aparece, mas não recebe pedido; excluído = `D_E_L_E_T_='*'` —
vira `active=false` no Addere, registro preservado, como no Protheus.

**009 — DONE em 08/10/2026**, em duas entregas. Passo 1 (atraso calculado do
vencimento) mergeado na `staging` pelo PR #197. Passos 2–7 na branch
`feat/sync-incremental`: código (`b3c9282`) e migration (`e91f174`) em commits
separados. **Ainda não mergeado.**
Dois desvios do plano, os dois descobertos na execução:
- **Placeholder `{{INCREMENTAL}}` (0/1), além do `{{DESDE}}`.** Com uma consulta
  só, a carga completa de títulos (`{{DESDE}}` = 1900) traria o histórico
  inteiro, inclusive os já pagos. `{{INCREMENTAL}} = 0` faz a mesma consulta
  devolver a foto do que está em aberto — e é o que a prévia e a reconciliação
  usam, então a reconciliação compara exatamente o saldo em aberto de hoje.
- **`{{DESDE}}` em ISO com "T"** (`2026-10-08T11:33:19.920`). Com
  `'AAAA-MM-DD hh:mm:ss'`, um SQL Server em português (DATEFORMAT dmy) lê
  ano-dia-mês.
Verificação: 638 testes da API (21 novos), duas mutações deliberadas pegas
pelos testes; migration validada num banco local descartável (as migrations do
zero reproduzem o schema sem diferença; sem a nova, a tabela aparece).
**Atenção ao publicar:** a consulta só vira incremental quando a versão
publicada usa `{{DESDE}}` — basta publicar a referência incremental. A primeira
execução depois disso é completa e cria o cursor. Confirmar com o DBA do
cliente índice em `S_T_A_M_P_` na SE1 e na SD2.

**010 — DONE em 08/10/2026**, branch `fix/cliente-bloqueado-visivel`, 5
commits. **Ainda não mergeado.** Executado por agente, revisado: diff lido,
regras da marca conferidas (StatusPill reaproveitado, nenhuma cor fixa).
Um acréscimo aceito: se o cliente for bloqueado depois de o plano do dia ser
gerado, o item ainda tem "Cheguei" e o atalho visita → pedido pularia o
seletor — agora o app avisa na hora em vez de falhar no envio (422).
Mudança de comportamento a saber: `createOrder` não validava o cliente; agora
cliente de outra empresa ou excluído dá 404.
**009 + 010 juntos:** as duas branches se fundem sem conflito; o resultado
combinado passou em tipos, lint, 651 testes da API, 166 do web e 185 do mobile.
Ordem de merge indiferente. O 010 toca o app: entra no próximo OTA, sem build.

### Fase 4 — atendimento à distância (planejada em 08/10/2026)

| Plano | Título | Prioridade | Esforço | Toca o app? | Depende de | Status |
|-------|--------|------------|---------|-------------|------------|--------|
| 011 | Atendimento à distância — registrar contato por telefone ou WhatsApp | P2 | M | **sim**, só JS (OTA, sem build) | — | **DONE** |

**Decisão de produto (08/10/2026):** o cliente distante **continua no plano de
visitas** e o raio de distância do ranking **não** será mudado agora — só se
acrescenta a opção de registrar o atendimento como feito à distância. Tem
migration (valor de enum + coluna), gerada por último.

**011 — DONE em 08/10/2026**, branch `feat/atendimento-a-distancia`: API e
histórico (`3e36f8a`), app (`ce21408`) e migration em commit separado.
Verificação: tipos, lint, 683 testes da API (7 novos), 171 do web (3 novos),
196 do mobile (9 novos); os testes do plano 006 passaram sem alteração;
mutação deliberada na regra de prioridade derrubou 7 testes. Migration com
exatamente as três instruções previstas, validada num banco local descartável
(as migrations do zero reproduzem o schema; sem a nova, a diferença aparece).
Desvio pequeno: a linha da visita do painel saiu da página para
`apps/web/src/lib/visit-history.ts`, como o passo 4 previa para poder testar.
"À distância" e "Cheguei" ficam num grupo, para descerem juntos na quebra de
linha — não conferido em aparelho de 375 pt. **Ordem de publicação
obrigatória:** API (com a migration) no ar **antes** do OTA. App novo mandando
`REMOTE` para API antiga leva 400, e a fila trata 4xx como rejeição permanente
(`isPermanentRejection` em `syncEngine.ts`) — o atendimento se perde, não
fica esperando.

Valores de status: TODO | IN PROGRESS | DONE | BLOCKED (com o motivo em uma linha) | REJECTED (com a justificativa em uma linha)

**Fase 1 fechada e em produção.** Os três planos foram revisados, aprovados e
mergeados até a `main` (`b7be724`) pelos PRs #169 (007), #170 (001) e #173 (002).

**Incidente registrado, para não repetir:** o 002 foi aberto primeiro como PR
empilhado (#171), com base na branch do 007 em vez de `staging`, para o diff da
revisão não repetir o código do 007. O GitHub só reaponta um PR empilhado quando
a branch base é **apagada** no merge — ela não foi, então o #171 mergeou o 002
para dentro de uma branch já integrada, e o código ficou fora de `staging` e de
`main`. Foi detectado na conferência pós-merge (o arquivo `no-order.ts` não
existia na `main`) e corrigido pelo #173, apontando direto para `staging`.
**Lição: nesta base de código, PR vai direto para `staging`.** Diff sobreposto
custa alguns minutos de revisão; PR empilhado que depende de um passo manual
custa um deploy incompleto.

**Planos da fase 2 atualizados em 07/10/2026** para o estado pós-fase-1: nova
base (`b7be724`) na checagem de deriva, e os trechos de "Estado atual" que
citavam `sellerScopeWhere`/`TeamScope`/`resolveTeamScope`/`resolveDataScope`
foram trocados pelo resolvedor único (`resolveViewerScope`, `sellerWhere` em
`users/data-scope.ts`), com os números de linha reconferidos no código vivo.
Sem isso, a checagem de deriva dispararia e um executor pararia no início —
corretamente.

Os worktrees de revisão (`../addere-wt-001`, `../addere-wt-002`,
`../addere-wt-007`) continuam no disco. Tudo que há neles já está na `main`;
podem ser removidos com `git worktree remove`.

**Fase 2 publicada em 07/10/2026 por OTA** (`eas update`), canal `production`,
runtime **1.1.1**, Android e iOS, a partir do commit `55929e765206` —
update group `af95cb65-f129-4e0d-852e-ab58f399115d`. Nenhum build de loja foi
necessário: as quatro entregas da fase 2 são só JavaScript, nenhuma toca config
nativa, plugin ou permissão.

**Armadilha encontrada na publicação, agora documentada em
`apps/mobile/docs/DEPLOY_CHECKLIST.md`:** o comando de OTA precisa de **três**
variáveis de ambiente, não duas. Além da URL da API e do `APP_ENV`, o
`EXPO_PUBLIC_APP_VERSION` decide o `runtimeVersion` (política `appVersion`), e
sem ele o update sai como runtime `1.0.0` e **não chega em nenhum aparelho** —
termina verde, aparece no dashboard, e ninguém recebe. O canal `production`
tinha, como update mais recente, exatamente isso: um de três meses antes
marcado com runtime 1.0.0, enquanto a loja estava na 1.1.1.

**008 — DONE em 07/10/2026**, branch `fix/responsividade-do-painel`, 3 commits,
5 arquivos. **Ainda não mergeado.** Aprovado sem rodada de revisão.
Origem: um print do painel no celular com o título cortado. A suspeita era
layout estourando a largura; **não era**. A 393px no emulador a `/users` não
vaza — é **scroll chaining do WebKit**, o gesto escapando da tabela para o
`<main>` quando ela chega ao fim. Corrigido com `overscroll-x-contain`, não
com mudança de largura.
A varredura das 14 telas achou mais dois, de naturezas diferentes: o
`OrderDetail` cortava colunas em silêncio dentro de um `overflow-hidden` (único
caso de dado invisível), e quatro modais punham campos de formulário em três
colunas a 390px.
Verificação: type-check, lint e `build:web` exit 0; 4 ocorrências de
`overscroll-x-contain`; os 8 `grid-cols-2` do `EntityModals` intocados; o
`<main>` do layout com diff vazio. No passo 2, confirmei por leitura do diff
que o rodapé do Protheus ficou **fora** da área de rolagem — era o erro que
compila sem reclamar.
Um desvio do executor, bem julgado: o comentário que ele ia pôr no `Table.tsx`
repetia o literal da classe e inflaria o grep de verificação que eu mesmo
escrevi. Ele reescreveu descrevendo o comportamento sem citar o token.

**004 — DONE em 07/10/2026**, branch `advisor/004-conversao-em-reais`, 4 commits,
7 arquivos, 809 linhas. **Ainda não mergeado.** Aprovado sem rodada de revisão.
O passo 1 foi corretamente **pulado**: o 006 já fazia o app gravar `Visit.orderId`,
então este plano não tocou `apps/mobile` — é o único da fase 2 que não mexe no app.
Verificação: type-check e lint exit 0, 612 testes da API, `build:web` exit 0;
`schema.prisma`, `engine/`, `intelligence/app/` e `apps/mobile/` com diff vazio.
As duas frases obrigatórias estão literalmente na tela: a nota de que o valor
esperado é ticket médio × probabilidade (e por isso não há comparação por
cliente) e o rodapé que declara quantos pedidos foram conciliados por data.
`CANCELLED` vira `orderTotal: null` nos dois caminhos de conciliação.
O executor acrescentou uma camada de teste que o plano não pedia — testes de
rota além dos de função pura —, com o argumento certo: a tradução de
`CANCELLED` e a conciliação por data acontecem no serviço, não no cálculo puro,
então testar só o puro não provaria que as regras funcionam.
**Nota de ambiente:** `npm run build:web` exige `apps/web/.env.local` (copiado do
`.env.local.example`); sem ele o build falha em `/inteligencia/saude` com
"NEXT_PUBLIC_API_URL não está definida". O arquivo é ignorado pelo git.

**003 — DONE em 07/10/2026**, branch `advisor/003-historico-de-visitas` (base: a
branch do 005), 15 arquivos, 5 commits. **Ainda não mergeado.** Uma rodada de
revisão, por **falha do plano, não do executor**: o 003 não tinha sido
atualizado para a regra do mês civil quando ela foi fixada, e saiu com pílulas
de 7/30/90 dias. Como a tela mostra conversão — apuração, não só log —, ela
precisa reconciliar com a tela de Resultado e com a meta mensal. Corrigido para
`Este mês`/`Mês passado`, com o último dia vindo do calendário e teste para
fevereiro bissexto e virada de ano. **Duas opções, não três, por cálculo:** três
meses civis podem dar 92 dias (jul+ago+set) e bateriam no `MAX_WINDOW_DAYS = 90`
da própria API. O plano 003 foi corrigido junto, para o erro não sobreviver no
registro.
Verificação: type-check e lint exit 0, 602 testes da API, 177 do mobile,
`build:web` exit 0; `require-vendor-code.ts`, `(app)/_layout.tsx` e
`schema.prisma` intocados; a rota do vendedor confirmadamente sem parâmetro
`vendorCode` de query; nenhum resolvedor de escopo novo.
Dois acertos do executor além do plano: acrescentou `source` ao DTO porque
`durationMin: null` é ambíguo entre "nasceu do pedido" e "ainda não concluiu" —
lacuna real do meu esboço; e trocou o "[ carregar mais ]" por seletor de
período, já que a API não tem paginação, em vez de inventar um parâmetro.

**005 — DONE em 07/10/2026**, branch `advisor/005-carteira-da-equipe` (base: a
branch do 006), 14 arquivos, 834 linhas. **Ainda não mergeado.** Aprovado sem
rodada de revisão. Verificação: type-check e lint exit 0, 590 testes da API, 159
do mobile, `build:web` exit 0; `require-vendor-code.ts`, `schema.prisma`,
`users/data-scope.ts` e `intelligence/app/` com diff vazio; nenhum resolvedor de
escopo novo foi criado.
Quatro desvios documentados e aceitos. O mais valioso: o executor percebeu que
`/intel/manager/home` é fixo na equipe direta de quem chama (decisão correta,
vinda do 007) e que reaproveitá-la no painel devolveria carteira **vazia** para
ADMIN/SUPERADMIN. Resolveu usando a rota da lista, que passa por `scopeFor`, sem
tocar a `/home` — evitou um card quebrado em produção. Os outros três:
`(app)/_layout.tsx` ganhou `href: null` para a pasta `equipe` não virar uma sexta
aba (o plano proíbe a sexta aba, então a mudança serve à intenção dele); o teste
de posse entrou no `manager-routes.test.ts` existente, onde o fixture
`manager-b` já existia; e `byStatus` mostra as seis chaves de `CustomerStatus`,
não as cinco do esboço, porque nenhum status pode sumir da tela.
O teste de 403 vai além do pedido: prova também que o corte acontece **antes de
qualquer consulta de cliente**.

**006 — DONE em 07/10/2026**, branch `advisor/006-pedido-vale-check-in`, 6
commits, 6 arquivos, 439 linhas. **Ainda não mergeado.** Duas rodadas de revisão:
(1) a deduplicação fazia o PATCH posterior do check-in explícito cair em 404,
perdendo resultado, duração e observação da visita — corrigido com adoção
direcional do `clientId` (ORDER→CHECKIN adota; o inverso nunca, porque a visita
explícita pode ter PATCH pendente); (2) o ramo de dedup descartava o
`planItemId` que chegava, fazendo a aderência contar visita planejada como fora
do plano. Verificação do revisor: nenhum `.env` no worktree e nenhum comando de
banco em commit nenhum (a migration foi escrita à mão), type-check e lint exit 0,
580 testes da API e 159 do mobile passando, `engine/` e `orders/` com diff vazio.
O executor melhorou o plano num ponto: usou `body.result ?? sameDay.result` em
vez do literal do texto, evitando que um check-in posterior zerasse um
`result: ORDER` já gravado.

**002 — DONE em 07/10/2026**, branch `advisor/002-motivos-de-nao-venda`
(worktree `../addere-wt-002`), 5 commits, 8 arquivos, 451 linhas. **Mergeado na
`main` pelo PR #173** (o #171 não contou — ver o incidente acima).
Revisão: critérios re-rodados — type-check e lint exit 0, 571 testes passando,
`build:web` exit 0, `apps/mobile` e `schema.prisma` com diff vazio. Os três
requisitos inegociáveis foram auditados um a um: normalização burra (com teste
provando que pontuação interna sobrevive e só a final cai), aviso de motivos
únicos incondicional quando `singletons > 0` com a frase "As barras não são
100% dos casos", e `noOrderReason` incluído no expurgo com o mesmo
`retentionCutoff` de `notes`. A rota usa `sellerWhere` do resolvedor unificado
do 007 — nenhum resolvedor novo foi criado.
Desvio aceito: o esboço previa um link "ver todas as N" para os motivos únicos,
que não foi implementado porque não existe endpoint de paginação no escopo. O
executor preferiu não prometer funcionalidade inexistente — decisão correta.

**007 — DONE em 07/10/2026**, branch `advisor/007-unificar-escopo-de-equipe`
(worktree `../addere-wt-007`), 6 commits, 10 arquivos. **Mergeado na `main` pelo PR #169.**

Histórico, porque ele importa: a primeira execução **parou no passo 4**, numa
condição de PARADA legítima — um teste pré-existente de `manager/__tests__/`
falhou e o executor não o ajustou. A causa era **defeito do plano**: a forma
alvo mandava o resolvedor pré-carregar a equipe inteira, o que adicionava uma
consulta redundante em todo request de `/intel/manager/*` e deslocava o
`mock.calls[0]` que o teste inspeciona. O plano foi corrigido (seção "Correção
de 07/10/2026"): `ViewerScope` passou a carregar só a decisão, e a equipe é
lida sob demanda por `customerWhere`/`orderOwnerIds`. A retomada fechou tudo.

Revisão: critérios re-rodados pelo revisor — `type-check` e `lint` exit 0, 564
testes passando, um resolvedor só (as ocorrências restantes de
`resolveTeamScope` são comentários históricos), e diffs vazios em
`schema.prisma`, `apps/web` e `apps/mobile`. **Nenhuma asserção de teste
pré-existente foi alterada** — a única mudança em `manager/__tests__/` é a
remoção do describe da função deletada, com comentário apontando onde o
comportamento passou a ser testado. O teste novo inclui
`expect(prismaMock.user.findMany).not.toHaveBeenCalled()`, trava de regressão
contra justamente o erro que causou a parada.

Fora do plano original, autorizado na correção: `orders.service.ts` entrou no
escopo para `ownerWhere(null)` devolver `{}` — escopo de empresa passa a não
filtrar dono, em vez de enumerar usuários ativos (que excluiria pedidos de quem
foi desativado).

**001 — DONE em 07/10/2026**, na branch `advisor/001-tela-resultado-inteligencia`
(worktree `../addere-wt-001`), 4 commits, 397 linhas em 4 arquivos. Revisão:
critérios re-rodados pelo revisor, escopo limpo, testes de calendário auditados.
Uma rodada de revisão foi necessária — a faixa de lift negativo não mostrava a
magnitude, só a positiva; corrigido em `0747394`. **Mergeado na `main` pelo PR #170.**
Desvio aceito e registrado: o selo de frescor do esboço foi omitido porque
`PilotMetricsResponse` não tem campo de `lastSyncAt` — se um dia a tela precisar
dele, é mudança de API, não de front.

### O que funciona antes do build

As partes de painel da fase 2 entram em produção junto com a API, sem esperar o
app — e funcionam, com uma ressalva cada:

- **005**: o card da carteira da equipe no painel funciona inteiro. O bloco na
  home do gerente **no app** só aparece depois do build.
- **003**: o histórico da equipe no painel funciona inteiro. A tela do vendedor
  no app só depois do build.
- **004**: os dois blocos funcionam, mas **tudo conciliado por data** enquanto o
  app não gravar `Visit.orderId` — que é exatamente o que o rodapé de
  transparência da tela existe para dizer. Quando o build sair, a proporção
  conciliada por vínculo direto cresce sozinha.
- **006**: a API e a migration são inofensivas sozinhas. Sem o app enviando
  `source`, nenhuma visita implícita é criada e nada muda de comportamento. O
  valor do plano só chega com o build.

## Notas de dependência

A fase 1 está na `main` (`b7be724`), então as dependências que envolviam 007,
001 e 002 já estão satisfeitas. O que sobra, entre os quatro planos da fase 2:

- **006 antes de 004.** O 006 faz o app passar a gravar `Visit.orderId`, que é o
  vínculo de que o 004 depende. Nessa ordem, o passo 1 do 004 já estará feito
  (é o mesmo arquivo e a mesma mudança) e a conciliação por data dele cobre só
  o histórico anterior ao deploy.
- **006 antes de 003**, se possível. O 003 precisa saber exibir visita sem
  duração nem GPS (`source: 'ORDER'`). Na ordem inversa o 003 nasce certo mesmo
  assim — a regra está escrita nele —, só não tem como ser testada com dado real.
- **A API do 006 pode ir ao ar sozinha**, bem antes do build. Sem o app enviando
  `source`, o zod ignora o campo ausente e nada muda. O inverso não vale: app
  novo contra API velha faria o `source` ser descartado em silêncio e as visitas
  nasceriam como `CHECKIN`. Ordem obrigatória: migration → API → build.
- **003 e 005 são irmãos conceituais** e convém saírem na mesma janela: aplicam a
  mesma regra de escopo de equipe a dados diferentes, e os dois acrescentam rota
  sob `/intel/manager`. Quem executar o segundo deve ler o teste de posse escrito
  pelo primeiro antes de escrever o seu.
- **004 está desbloqueado**: ele depende da página `/inteligencia/resultado`, que
  o 001 criou e já está na `main`.
- **Todos os quatro tocam `apps/mobile`** — 006 e 004 só em código, sem tela nova;
  003 e 005 acrescentam tela. Por isso nenhum deles publica build: ver
  "Estratégia de entrega" no topo.
- **Resolvedor de escopo:** desde o 007 existe um só, em
  `apps/api/src/modules/users/data-scope.ts`. Qualquer plano que precise recortar
  por equipe importa `sellerWhere` de lá. Criar outro desfaz o 007 e é condição
  de PARADA.

## O que cada plano desbloqueia

- **007** acaba com a duplicidade de escopo de equipe e conserta um bug ativo:
  hoje um `ADMIN` que também receba `intel.manager` fica **sem nenhum cliente**
  na aba Clientes do app, enquanto continua vendo a empresa inteira no painel.
  É o único plano de risco HIGH da série, porque mexe em quem enxerga o quê.
- **006** fecha o buraco que inutiliza parte da medição: pedido feito sem o
  "Cheguei" não gera visita nenhuma hoje — o cooldown do motor não dispara, a
  aderência conta o dia como não trabalhado e a venda não aparece na positivação
  da visita. Por decisão de produto, fazer o pedido passa a valer como check-in.
- **001** responde "a Inteligência está vendendo mais?" com código que já existe
  e está testado. É o único plano sem backend nenhum.
- **002** é o primeiro uso de um dado qualitativo que o app **obriga** o vendedor
  a digitar e que nunca foi lido. Também corrige uma lacuna de retenção: o campo
  é texto livre e hoje não é expurgado.
- **005** corrige uma assimetria real: o núcleo do app já entrega ao gerente a
  carteira da equipe (`users/data-scope.ts`), mas a camada de Inteligência não —
  as rotas de carteira com sinais exigem código de vendedor, que o gerente não
  tem. Ele vê a equipe como lista de clientes, nunca como carteira com risco.
- **003** fecha o laço de confiança com quem está na rua, dos dois lados.
  Efeito colateral relevante: o `Visit` é o que alimenta o cooldown de 7 dias do
  motor — vendedor que não vê valor em registrar para de registrar, e aí o plano
  do dia para de rotacionar.
- **004** tira a medição do binário e põe em reais, e é o primeiro lugar onde o
  motor é cobrado pela própria projeção. **Revisado em 06/10/2026**: a checagem
  revelou que `Visit.orderId` nunca é preenchido pelo app, apesar de o backend
  aceitar o campo. O plano ganhou um passo 1 que conserta a origem e um passo 3
  que concilia o histórico por data, declarando na tela quanto foi inferido.

## Regras de produto confirmadas em 06/10/2026

Valem para todo plano desta série e para qualquer tela futura:

- **A unidade de apuração é o mês civil.** Nunca "30 dias" nem "90 dias": meses
  têm 28, 29, 30 ou 31 dias, e janela móvel não fecha com meta nenhuma. Toda
  data de período sai do calendário, nunca de `início + 30`.
- **A meta do vendedor é mensal** (`GoalSnapshot.period` é `YYYYMM`) e **a meta
  do gerente é a soma das metas dos vendedores ligados a ele**. Já implementado
  em `buildTeamGoal`, usado por `buildManagerHome`
  (`manager.service.ts:354-379`) — não reimplemente, reutilize.
- **A carteira do gerente é a de todos os vendedores ligados a ele**
  (`User.managerId`), mais a dele própria quando tiver código de vendedor.
- **Fazer o pedido vale como check-in**, sem perguntar nada ao vendedor.

## Achados considerados e descartados

- **Escrever o status `CLOSED` do plano no fim do dia** (hoje o valor existe no
  enum `PlanStatus` e nunca é escrito por nada): **decidido em 06/10/2026 — não
  fazer.** O dia não precisa ser fechado; a unidade que importa na operação é o
  **fim do mês**, que é como a meta já funciona (`GoalSnapshot.period` é
  `YYYYMM`). Fechar o dia acrescentaria ciclo de vida ao `VisitPlan` sem
  responder a nenhuma pergunta comercial. O que falta é conseguir olhar o que
  foi feito, e isso o plano 003 entrega sem tocar nesse ciclo.
- **Trocar o texto livre do motivo de não-venda por motivos pré-definidos no
  app**: melhoraria muito a agregação, mas quebra a comparabilidade com o
  histórico já coletado e muda a rotina de quem está na rua. A decisão fica
  melhor depois de olhar os dados reais que o plano 002 vai expor pela primeira
  vez. Não é "não", é "ainda não".
- **Declarar `@relation` entre `Visit` e `Order` no Prisma**: rejeitado de
  propósito. `Visit` é da camada de Inteligência e `Order` é do núcleo do app;
  o join manual em lote mantém os dois com ciclos de vida independentes e custa
  uma query a mais, não um N+1.
- **Aba nova no app para o histórico de visitas**: rejeitado. A barra já tem
  cinco itens e a tela é de consulta ocasional, não de uso diário — ela entra
  como irmã de `semana` dentro de Rota.
- **Regenerar o plano da semana na sexta-feira** (hoje `weekDays.length >= 2`
  impede, então na sexta o gerente vê o plano montado na quinta): é
  comportamento conhecido e defensável — com um dia útil restante não há semana
  para planejar. Fica registrado para não ser reauditado como bug.
