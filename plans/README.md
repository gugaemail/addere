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

### Fase 2 — tocam o app; acumulam até o build final

| Plano | Título | Prioridade | Esforço | O que muda no app | Depende de | Status |
|-------|--------|------------|---------|-------------------|------------|--------|
| 006 | Fazer o pedido valer como check-in | P1 | M | comportamento, nenhuma tela | — | TODO |
| 005 | Dar ao gerente a carteira da equipe com os sinais da Inteligência | P1 | M | **tela nova** + bloco na home do gerente | — | TODO |
| 003 | Devolver ao vendedor o histórico do próprio trabalho (e ao gerente, o da equipe) | P2 | L | **tela nova** em Rota | — | TODO |
| 004 | Medir a conversão em reais, não só em "comprou ou não" | P2 | L | uma linha, invisível | 001, 006 | TODO |

**Nenhum executor publica build.** Ao terminar um plano da fase 2, pare no
código: o build é um passo de operação, manual, depois que os quatro estiverem
na branch.

A numeração é de criação; a ordem acima é de execução. O **007 vem primeiro**
porque é refactor de visibilidade — feito antes, os planos 002, 003 e 005 já
nascem usando um resolvedor só; feito depois, ele tem que migrar o código deles
junto. O **006 abre a fase 2** porque conserta a origem do dado que o 004 lê, e
é o único plano com migration.

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
