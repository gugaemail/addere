# Gestão Addere — operação

Processos da Gestão Addere que o sistema não faz sozinho, e onde cada promessa
do contrato é cumprida. Os planos 015 a 018 acrescentam as seções deles aqui.

## Contrato e aceite

Plano 014. O Contrato de Licença de Uso e o termo aditivo são modelos de texto
versionados (Gestão Addere › Modelos de contrato). O documento enviado ao
cliente guarda o texto preenchido e congelado, com o SHA-256 dele; o aceite
registra quem aceitou, a data e a hora, o IP, o navegador e o hash.

### Publicar um modelo

- Só depois do OK do advogado. Quem tira as marcas `[[REVISAR]]` é o
  superadmin, no painel; o sistema não publica modelo com marca nem com campo
  desconhecido.
- Antes de publicar o primeiro contrato, resolver os itens que bloqueiam a
  publicação (aviso de `contrato-licenca-de-uso-v1.md`):
  1. o instrumento de transferência internacional (§8.7) conferido fornecedor
     a fornecedor, inclusive o caso do Nominatim e o dos SDKs de mapa;
  2. Termos de Uso e Política de Privacidade do site alinhados e publicados
     junto com o contrato (branch `advisor/014-termos-e-privacidade` do site),
     e a landing junto (branch `landing/inteligencia-pelo-contrato`);
  3. o monitor de disponibilidade da API e do painel no ar, com histórico
     mensal, medindo há algumas semanas (ver "Disponibilidade e crédito");
  4. este documento escrito (é ele).
- **A v1 é editada no lugar e publicada.** A migration grava a v1 de cada tipo
  em rascunho (DRAFT), com o texto da minuta e as marcas `[[REVISAR]]`, e a
  API recusa versão nova enquanto houver rascunho aberto (409
  `TEMPLATE_DRAFT_EXISTS`; o painel esconde "Nova versão"). O caminho é:
  "Editar" a v1, tirar as marcas, salvar e publicar. "Nova versão" só existe
  depois de uma publicada. Editar a v1 sobrescreve no banco o texto que a
  migration gravou; a fonte da minuta continua em
  `contrato-licenca-de-uso-v1.md` e `aditivo-contratual-v1.md`. O roteiro do
  ponta a ponta do plano 014 ("crie a v2 de cada tipo a partir da v1") não é
  executável por isso; vale este item.
- Contrato e aditivo são publicados juntos: o aditivo v1 cita o §6.4, o §6.7,
  o §13 e o §14 do contrato v1. Renumerar o contrato exige versão nova do
  aditivo.
- Publicar uma versão nova não muda documento já enviado ou aceito: o texto
  aceito é o congelado no documento.

### Promessas do contrato × quem cumpre

A tabela da minuta (aviso de `contrato-licenca-de-uso-v1.md`), com o dono de
cada linha. "Em produção" é a data em que o plano dono entrou em produção;
enquanto não entrou, vale o processo de "O que é cumprido à mão".

| # | Promessa | Onde | Dono | Em produção |
|---|---|---|---|---|
| 1 | Aviso de suspensão com a data, ≥ 10 dias corridos antes | §6.5, §6.6 | Plano 017 | ainda não |
| 2 | Suspensão não apaga dados | §6.5 | Plano 017 | ainda não |
| 3 | Alteração só depois do aceite; até lá vale a versão anterior | §13 | Plano 014 | junto com o 013 e o 014 |
| 4 | Aumento de preço comunicado com ≥ 30 dias | §6.7, §13 | Plano 014 | junto com o 013 e o 014 |
| 5 | Cancelamento com efeito no fim do mês, que é cobrado | §3.9 | Plano 016 | ainda não |
| 6 | Licença adicional cobrada a partir do mês seguinte | §3.5, §6.4 | Planos 015 e 016 | ainda não |
| 7 | Incidente comunicado em 48 h | §8.6 | Processo (abaixo) | — |
| 8 | Cópia dos dados em 30 + 15 dias e eliminação depois | §12.3 | Processo (abaixo) | — |
| 9 | Nada vale antes do aceite; mês do aceite não cobrado; carência; 1ª fatura | §3.7, §6.3 | Planos 013 (calendário), 014 (início no aceite) e 016 | 013 e 014 juntos; 016 ainda não |
| 10 | Fatura pós-paga no início do mês seguinte, disponível no painel | §6.2 | Plano 016 | ainda não |
| 11 | Mudança vale para o limite na hora e para a cobrança na competência seguinte | §6.4 | Planos 013, 015 e 016 | 013 sim; 015 e 016 ainda não |
| 12 | Vendedor e gerente ocupam licença; administrador não; limite bloqueia ativação | §3.2, §3.3 | Plano 015 | ainda não |
| 13 | Pedido de adicionais no painel, com o preço e o registro do aceite | §3.5, §14.3 | Plano 015 | ainda não |
| 14 | Inteligência ligada e desligada pelo tipo de licença | §3.6 | Plano 014 | junto com o 013 e o 014 |
| 15 | Administrador vê contrato, aditivos e faturas na suspensão | §6.6 | Plano 017 (faturas no 016) | ainda não |
| 16 | Registro do aceite, texto congelado, impressão em PDF | §14 | Plano 014 (IP real conferido no staging) | junto com o 013 e o 014 |
| 17 | Aditivo sem aumento, ou a pedido da Empresa, vale no aceite; com aumento ou condições novas, 30 dias | §13 | Plano 014 | junto com o 013 e o 014 |
| 18 | Dados isolados por empresa, cifrados em trânsito e em repouso | §8.3 | Já existe (HTTPS, Neon, `protheus-crypto.ts`); a cópia offline no aparelho depende da cifra do sistema operacional: conferir | — |
| 19 | Textos da Inteligência com dados pseudonimizados e conferidos | §8.9 | Já existe (`ALLOWED_FACT_KEYS` e a conferência do agente) | — |
| 20 | Eliminação dos dados de um titular a pedido da Empresa | §8.4, §8.5 | Processo (abaixo) | — |
| 21 | Disponibilidade de 99,5 % de cada mês civil | §9.7 | Monitor de disponibilidade: **ainda não existe** e bloqueia a publicação | — |
| 22 | Crédito proporcional abatido na fatura da competência seguinte | §9.8 | Processo, com o item `DISCOUNT` do 016 | — |
| 23 | Crédito sem fatura seguinte pago por Pix em até 30 dias | §9.10 | Processo (abaixo) | — |
| 24 | Só o administrador indicado aceita e pede licenças | §3.5, §14.1 | Planos 014 (aceite) e 015 (pedido) | 014 junto com o 013; 015 ainda não |
| 25 | A Addere rescinde com aviso de no mínimo 30 dias | §12.2 | Processo (abaixo) | — |
| 26 | Encerrado o contrato, o acesso é bloqueado | §12.4 | Planos 016 e 017; até lá, à mão (abaixo) | ainda não |

As linhas 25 e 26 entraram na tabela da minuta em 16/10/2026, achadas na
execução do 014. O processo de cada uma:

- **§12.2 — a Addere rescinde com aviso de no mínimo 30 dias**, salvo uso
  ilícito ou violação grave. Processo: o aviso sai por e-mail, de
  contato@addere.com.br, ao contato principal e ao contato de cobrança, com a
  data do encerramento; o cancelamento só é registrado no sistema (plano 016)
  para uma data pelo menos 30 dias depois do aviso.
- **§12.4 — encerrado o contrato, o acesso é bloqueado.** Plano 016 (o
  cancelamento desativa a empresa, decisão D7) e plano 017 (empresa desativada
  tem o acesso bloqueado, decisão 3). Até lá, o superadmin desativa a empresa à
  mão no dia do encerramento.

### Disponibilidade e crédito (§9.7 a §9.10)

- **Monitor:** ainda não existe. O keep-alive do GitHub Actions a cada 14
  minutos não mede nem guarda histórico. Antes do primeiro contrato, um monitor
  externo precisa checar a API (`/health`) e o painel e guardar o histórico por
  mês civil, em horário de Brasília. Registrar aqui qual é o serviço e onde
  fica o histórico quando ele entrar.
- **Fechar o mês:** no dia 1, somar os minutos fora do ar do mês anterior, sem
  as janelas de manutenção comunicadas antes e sem as hipóteses do §9.1.
  Disponibilidade = 1 − (minutos fora ÷ minutos do mês).
- **Crédito:** abaixo de 99,5 %, crédito = minutos fora ÷ minutos do mês ×
  valor mensal da licença daquele mês. Lançado à mão como item `DISCOUNT`
  "Crédito por indisponibilidade" na fatura da competência seguinte (plano
  016), com os minutos na descrição.
- **Sem fatura seguinte** (contrato encerrado): pagar o crédito por Pix, para
  conta de titularidade da Empresa, em até 30 dias do encerramento, fora do
  sistema, e guardar o comprovante.

### Administrador indicado (decisão 10)

- O superadmin só cria usuário ADMIN por indicação da Empresa e só troca o
  indicado a pedido dela. Guardar o pedido (e-mail do representante legal ou
  do contato principal) junto com os documentos do cliente.
- Trocar o indicado com documento enviado cancela o documento: é preciso
  enviar de novo. Com o contrato ativo, a troca não exige aditivo; o próximo
  aditivo já sai com o nome novo.
- Se o indicado sai da empresa e ninguém avisa, aditivos e pedidos de licenças
  ficam travados até a troca: a aba Contrato e o `/contrato` mostram o aviso.
- **Achado, fora deste plano:** pelo `POST` e pelo `PATCH
  /companies/:id/users`, o ADMIN do cliente consegue criar ou promover outro
  ADMIN, e por essas rotas e pelo `/users` consegue trocar o e-mail e a senha
  de outro ADMIN, inclusive do indicado. O aceite relê o indicado no banco como
  defesa, mas fechar essas rotas (só o SUPERADMIN cria ou promove ADMIN) é
  pendência da segunda etapa.

### O que é cumprido à mão até o plano dono entrar

Enquanto o 015, o 016 e o 017 não estiverem em produção:

- **Limite de licenças (015):** o sistema ainda não barra a ativação. Toda
  semana, conferir na lista de clientes as licenças em uso (vendedores e
  gerentes ativos) contra o limite do contrato; acima do limite, avisar o
  administrador indicado e propor aditivo ou pedir a desativação.
- **Licenças adicionais (015):** o pedido chega por e-mail do administrador
  indicado; a contratação é feita por aditivo ("Propor aditivo"), aceito por
  ele no painel.
- **Faturas (016):** no início de cada mês, calcular a competência anterior
  pelos termos da competência (os que valiam antes das 00:00 do dia 1), emitir
  e enviar a cobrança por fora, ao contato de cobrança, com vencimento no dia
  do contrato. O mês do aceite e os meses de carência não são cobrados.
- **Avisos de atraso e suspensão (017):** o aviso de suspensão vai por e-mail
  ao contato de cobrança com no mínimo 10 dias corridos de antecedência e a
  data prevista. A suspensão só acontece depois desse prazo, desativando os
  vendedores e gerentes da empresa (o administrador continua entrando e vendo
  o contrato e os aditivos, §6.6), e nunca apaga dados. Desativar a empresa
  ainda não corta o acesso antes do 017. Registrado o pagamento, os usuários
  são reativados no mesmo dia.
- **Cancelamento (016):** o pedido chega por escrito em
  contato@addere.com.br; o contrato termina no último dia do mês do pedido, e
  esse mês é cobrado.

### Processos sem sistema

- **Incidente de segurança (§8.6):** quem toma conhecimento avisa o
  encarregado; a Addere comunica a Empresa em até 48 horas, por e-mail de
  contato@addere.com.br ao contato principal e ao administrador indicado, com o
  que se sabe no momento, e complementa conforme a apuração avança.
- **Cópia dos dados no encerramento (§12.3):** a Empresa pede em até 30 dias
  do encerramento, por escrito; a Addere entrega em até 15 dias corridos do
  pedido, em formato legível por máquina. Sem pedido em 30 dias, os dados são
  eliminados, ressalvados os registros do §8.5.
- **Eliminação dos dados de um titular (§8.4):** a pedido da Empresa, a
  Addere elimina os dados pessoais do titular mantidos no Addere; registros
  fiscais e financeiros ficam identificados e bloqueados pelo prazo legal
  (§8.5).

### Edição × aceite: a ordem das travas

Achado do teste de ponta a ponta de 18/10/2026: o aceite e a edição do
rascunho (ou do aditivo) disparados juntos respondiam 200 os dois, e os termos
que acabavam de virar EFFECTIVE ficavam com o valor da edição, não com o do
texto aceito. A fatura sairia por um preço que o cliente não aceitou. Na
corrida do aditivo, a ordem invertida das travas ainda dava deadlock (500).

A regra, desde então: **toda transação que escreve no contrato, nos termos ou
nos documentos de uma empresa começa por `lockContractRow`**
(`apps/api/src/modules/billing/contract-lock.ts`), o `UPDATE` do contador
`seatGuardVersion` na linha do contrato, e só depois lê o estado e decide.

| Função | Arquivo | Depois da trava |
|---|---|---|
| `saveContractDraft` | `contract.service.ts` | relê o status; ACTIVE → 409 `CONTRACT_NOT_DRAFT` |
| `acceptDocument` | `me.service.ts` | lê o documento; CANCELLED → 409 `DOCUMENT_NOT_PENDING` |
| `saveAmendment`, `withdrawAmendment` | `contract-documents.service.ts` | relê a proposta; a versão da tela diferente da do banco → 409 `TERMS_NOT_EDITABLE` |
| `sendDocument`, `setDesignatedAdmin`, `cancelDocument`, `resendDocumentEmail` | `contract-documents.service.ts` | relê contrato e documento |
| `withSeat` | `seat-guard.ts` | conta as licenças |
| `createLicenseRequest`, `decideLicenseRequest` | `license-requests.service.ts` | relê contrato e pedido |

O cancelamento do contrato (`contract-cancel.service.ts`) começa por um
`updateMany` na própria linha do contrato, com o estado no `where`, e conta
como a mesma trava.

Além da trava, os termos editáveis só mudam com `status: 'PROPOSED'` no
`where`, e o `count` é conferido: 0 vira 409, nunca 200. O painel manda no
aditivo a versão que está editando (`termsVersion`); se o cliente aceitou no
meio, a API recusa em vez de criar outra proposta sem ninguém perceber.

Com a trava, cada corrida termina num de dois jeitos: o aceite passa e a edição
recebe 409, ou a edição passa, o documento é cancelado e o aceite recebe 409.
Nenhum teste com mock simula concorrência: mudar o nível de isolamento, ler ou
escrever antes da trava ou esquecê-la numa mutação nova desfaz a garantia sem
deixar teste vermelho. A prova é contra Postgres real (os scripts `race1` e
`race2` do relatório do teste).

### Retenção

Contrato, documentos enviados e registros de aceite ficam durante a vigência e
por 5 anos depois do encerramento. Nenhum job de expurgo toca
`billing_contract_documents`; `renderedBody` e `sha256` nunca mudam depois de
criados.

### IP do aceite

- `TRUST_PROXY_HOPS` (padrão 1) diz quantos proxies ficam na frente da API. O
  Fastify confia só nesses saltos do `X-Forwarded-For`; com `true`, o IP seria
  o que o próprio cliente escreve.
- Conferir no staging, depois de cada mudança de infraestrutura: fazer uma
  requisição, achar nos logs do Render o `remoteAddress` dela e comparar com o
  IP público de quem fez (`curl https://api.ipify.org`). Se aparecer o IP do
  proxy, subir `TRUST_PROXY_HOPS` em 1 no serviço e repetir. Se continuar
  errado, não publicar o contrato em produção.
- Em 17/10/2026, com o valor 1, o `remoteAddress` dos logs de produção era um
  IP da Cloudflare (172.71.x, 104.23.x): na frente da API ficam a Cloudflare e
  o balanceador do Render. O valor certo é **2**. As requisições de
  `127.0.0.1` nos logs são o health check interno do Render.
- O valor também está no `render.yaml` (`'2'`): ao mudar no painel do Render,
  mudar lá também, senão o próximo sync do blueprint volta o valor.
- **O IP também aparece no log de acesso.** O logger padrão do Fastify grava o
  `remoteAddress` (o `request.ip` resolvido pelo `trustProxy`) de toda
  requisição, inclusive a do aceite (`POST /billing/me/documents/:id/accept`)
  e a do pedido de licenças. É log operacional padrão, e é ele que permite a
  conferência do `TRUST_PROXY_HOPS` acima: fica. Esse IP fica nos logs do
  Render pelo prazo de retenção deles e não é o registro de prova: a prova do
  aceite é a do documento (`acceptedIp`, com data, navegador e hash), e a do
  pedido, a do `billing_license_requests`. O histórico da ficha
  (`BillingEvent`) e o Sentry nunca levam IP.

### Levar um cliente às condições gerais novas

- Aditivo com "Levar às condições gerais publicadas": o documento carrega o
  aditivo e, como anexo, o contrato consolidado na versão nova, no mesmo hash.
- Sempre com "vale a partir de" ≥ envio + 30 dias, mesmo a pedido da Empresa.
- Só com um modelo de aditivo que preveja o anexo, validado pelo advogado. O
  aditivo v1 diz que as demais cláusulas não mudam e **não** serve para isso.

## Licenças

Plano 015. O contrato vende N licenças; a trava faz o número valer.

### Quem ocupa licença

- Usuário **ativo** com perfil vendedor ou gerente (`SALESPERSON`) dentro da
  empresa. ADMIN é grátis. Desativar libera a licença na hora.
- Fonte única da contagem: `countSeatHolders`, em
  `apps/api/src/modules/billing/seat-guard.ts`. A leitura (`GET
  /billing/me/seats`, o `/plano` e a aba Licenças da ficha) e a trava usam a
  mesma função. O 018 também.
- O limite é `includedSeats + extraSeats` dos termos atuais
  (`resolveCurrentTerms`). O Ilimitado passa pela mesma trava, com a quantidade
  digitada no contrato.
- Sem contrato (teste, piloto, implantação), em rascunho ou aguardando aceite:
  sem limite. Contrato cancelado: ninguém é criado nem ativado (409
  `CONTRACT_CANCELLED`).
- Redução de pacote não desativa ninguém: o medidor mostra "acima do limite"
  e a trava recusa novas ativações até o ADMIN desativar usuários.
- A trava vale também para o SUPERADMIN. Passar do limite sem pedido do
  cliente é aditivo (decisão 9), não atalho.

### A trava: `writeWithSeatGuard`

Os seis pontos que criam, ativam, vinculam ou mudam alguém para
`SALESPERSON`, e todos passam por `writeWithSeatGuard`:

| # | Onde | O que faz |
|---|---|---|
| 1 | `users.service.ts` `createUser` | `POST /users` |
| 2 | `companies.service.ts` `createUser` | `POST /companies/:id/users` |
| 3 | `users.service.ts` `toggleUserActive` | `PATCH /users/:id/active` |
| 4 | `companies.service.ts` `toggleUserActive` | `PATCH /companies/:id/users/:userId/active` |
| 5 | `companies.service.ts` `updateUser` | `PATCH /companies/:id/users/:userId` e `PATCH /users/:id`, que delega para cá |
| 6 | `users.service.ts` `updateUserById` | vínculo de usuário órfão a uma empresa |

**Regra:** todo caminho novo que cria, ativa, vincula ou muda alguém para
`SALESPERSON` (importação em lote, SSO, convite) tem de passar por
`writeWithSeatGuard`. Quando a segunda etapa unificar os dois `createUser`, os
seis viram cinco: atualize esta tabela junto. Os scripts de operador
(`packages/db/prisma/seed.ts` e `apps/api/scripts/seed-demo-tenant.ts`)
escrevem direto no banco, de propósito fora da trava.

Só entra na trava a escrita que **passa a ocupar** uma licença
(`consumesSeat`); desativar nunca entra. No limite, a resposta é 409
`SEAT_LIMIT_REACHED` com `details: { used, limit }`.

**Por que duas escritas ao mesmo tempo não furam o limite.** A trava começa
com um `UPDATE` do contador `seatGuardVersion` na linha do contrato da
empresa (`lockContractRow`, a mesma do aceite: ver "Edição × aceite: a ordem
das travas"). Todo `UPDATE` no Postgres prende a linha até o fim da transação: a
segunda escrita da mesma empresa espera a primeira terminar. No READ COMMITTED
(o padrão do Postgres e do Neon), a contagem que ela roda depois de liberada é
um comando novo e já vê o vendedor que a primeira gravou. Com 19 de 20, a
primeira conta 19 e grava; a segunda conta 20 e recusa. Empresas diferentes
não esperam umas pelas outras.

Três coisas desfazem a garantia **sem nenhum teste ficar vermelho** (o mock
não simula concorrência):

1. mudar o nível de isolamento da transação (SERIALIZABLE ou REPEATABLE READ
   trocariam a fila por erro de serialização);
2. contar antes da trava (a ordem é: trava, contrato e termos, contagem,
   escrita);
3. escrever com `prisma` em vez do `db` que a trava entrega.

Quem revisar uma mudança na trava confere, nesta ordem: o `updateMany` antes
do `count`; o `write` usando `db`; os seis pontos chamando
`writeWithSeatGuard`.

### Pedido de licenças adicionais

- Só o **administrador indicado** pede (decisão 10), no `/plano`. O pedido
  mostra o preço por licença dos termos atuais e vale como contratação, sem
  aditivo (§3.5 e §14.3). Os outros ADMINs veem o botão desativado, com o
  nome do indicado; o `POST /billing/me/license-requests` dá 403
  `NOT_DESIGNATED_ADMIN`.
- A declaração aceita sai de `licenseRequestDeclaration` (`@addere/types`): o
  painel mostra o resultado e a API grava o mesmo texto, com o SHA-256, nome e
  e-mail de quem pediu, IP e navegador.
- Um pedido pendente por empresa (409 `LICENSE_REQUEST_PENDING`). Preço
  diferente do atual: 409 `LICENSE_PRICE_CHANGED`, e o modal passa a mostrar o
  preço novo.
- O aviso vai por e-mail para o `notifyEmail` das regras de cobrança. Sem ele
  (ou sem `RESEND_API_KEY`), o pedido é gravado e o e-mail é pulado com aviso
  no log; o superadmin vê o pedido em Gestão Addere › Solicitações de qualquer
  forma.

Ciclo: **PENDING → APPROVED** ou **PENDING → REJECTED**.

- **Aprovar** cria termos novos EFFECTIVE na hora (`origin LICENSE_REQUEST`),
  copiando os valores dos termos atuais e somando a quantidade em
  `extraSeats`. O limite sobe na hora. A Inteligência é sincronizada pela
  mesma regra do aceite.
- A aprovação recusa com 409: contrato que não está ativo
  (`CONTRACT_NOT_ACTIVE`); aditivo em rascunho ou enviado
  (`AMENDMENT_PENDING`: o aditivo foi montado sobre os termos antigos e, ao ser
  aceito, apagaria as licenças aprovadas; aprove depois do aceite do aditivo,
  ou cancele o aditivo antes); aditivo aceito que ainda não passou a valer
  (`AMENDMENT_NOT_YET_EFFECTIVE`, pelo mesmo motivo); preço dos termos
  diferente do que o cliente aceitou (`LICENSE_PRICE_CHANGED`); pedido já
  decidido (`LICENSE_REQUEST_ALREADY_DECIDED`).
- **Recusar** exige o motivo, que o ADMIN vê no `/plano`. Nenhum e-mail sai na
  decisão.
- Trocar o indicado não mexe em pedido pendente: a declaração foi aceita por
  quem era o indicado na hora.
- **Cobrança:** os termos aprovados entram com `effectiveFrom` = o momento da
  aprovação, e o 016 cobra pelos termos vigentes no início de cada competência.
  Licença liberada no mês M não é cobrada em M; entra na fatura a partir de
  M+1, como a declaração promete.

### Retenção dos pedidos

O pedido guarda o IP, o navegador e o texto aceito, tratados por execução de
contrato (LGPD, art. 7º, V), com a mesma retenção do registro de aceite:
durante a vigência e por 5 anos depois do encerramento. Nenhum job de expurgo
toca `billing_license_requests`.

## Faturamento (plano 016)

Mensal e pós-pago, com baixa manual. O sistema calcula a fatura, registra,
lembra o cliente do vencimento e guarda a baixa; a Addere cobra por fora
(Pix, boleto, transferência) e o superadmin dá a baixa em Gestão Addere ›
Faturas. Não há gateway nem boleto automático.

### O agendador, de hora em hora

Na ordem, e cada passo isolado dos outros (um que falha não impede os
seguintes; queda de banco só vai ao log, o resto vai ao Sentry):

1. **Faturas**: gera as da competência anterior, no fuso de São Paulo. Às 22h
   de Brasília do dia 31 ainda é o mês que termina. Cobra só contrato aceito
   (ACTIVE, ou CANCELLED no mês em que terminou), a partir da primeira
   competência cobrada (o mês do aceite e a carência ficam de fora), com os
   termos que valiam antes das 00:00 do dia 1 da competência. A fatura vence no
   dia do contrato, no mês seguinte à competência.
2. **Encerramento**: passa a CANCELLED o contrato cujo último dia já passou
   (ver "Fim do contrato").
3. **Lembrete de vencimento**: um só por fatura em aberto com total maior que
   zero, no primeiro tick dentro de "dias de aviso" antes do vencimento (Pacotes
   e regras), ao contato de cobrança e aos ADMINs ativos.
4. **Lembrete de documento pendente**: um só por contrato ou aditivo enviado há
   72 h ou mais, ao administrador indicado.
5. **Aviso de suspensão**, 6. **lembrete de suspensão** e 7. **bloqueio e
   liberação por atraso**: plano 017, ver "Inadimplência e bloqueio".

### Como ligar

A variável `BILLING_JOBS_ENABLED` nasce `false` em todo lugar (`env.ts`, os dois
`.env.example` e os dois serviços do `render.yaml`). Ligar é operação, não
código, e nesta ordem:

1. deploy da API com a migration `billing_invoices` no ar;
2. no painel do Render, `BILLING_JOBS_ENABLED=true` no serviço;
3. o mesmo valor no `render.yaml`, senão a próxima sincronização do Blueprint
   volta para `false`;
4. no log de boot, `[billing-scheduler] ticker de 1 h iniciado` (desligado, o
   log diz `[billing-scheduler] desligado (BILLING_JOBS_ENABLED=false)`).

Staging só de propósito, para teste (o banco do staging é outro, ninguém é
cobrado de verdade). Produção só depois do primeiro contrato aceito. Nunca na
máquina local: o `.env` local aponta para um banco real.

### Rodar agora

`POST /admin/billing/jobs/run` (o botão "Rodar faturamento" da tela de
Faturas) roda o mesmo tick na hora e devolve o resumo. Funciona com a env
desligada: é a ferramenta de incidente. É seguro repetir: a fatura tem uma
por empresa e competência, e cada e-mail tem um `dedupeKey`, então nada sai
duas vezes, nem com um tick automático rodando junto.

### Regras da fatura

- **D1. Fatura cancelada ocupa a competência.** Cancelar quer dizer "este mês
  não será cobrado", e a fatura cancelada não volta. Para cobrar o mês depois,
  só um ajuste na fatura seguinte.
- **D2 e D3. Mês antigo entra por fatura avulsa.** O agendador só fatura a
  competência anterior. A avulsa é só para mês anterior ao corrente, sem fatura
  nessa competência, com vencimento a partir de hoje; com "usar o pacote do
  contrato", só para mês que o contrato cobre.
- **D4. Fatura paga só muda NF e observação.** Valores, itens, situação e baixa
  ficam como estão. Correção de fatura paga vira item de ajuste na seguinte.
- **D5. A baixa quita**, mesmo com valor diferente do total (juros,
  arredondamento). O valor recebido fica registrado; diferença a cobrar vira
  ajuste na próxima fatura.
- **Recalcular** (só em aberto) refaz os itens do contrato pelos termos da
  competência e mantém os descontos e ajustes manuais. Não muda o vencimento.
- **Fatura que nasce vencida** (env ligada tarde, servidor fora do ar no dia 1)
  vai ao Sentry. O vencimento não é prorrogado; a liberação até uma data é do
  plano 017.
- **Crédito por indisponibilidade**: item `DISCOUNT` à mão, na fatura da
  competência seguinte (ver "Disponibilidade e crédito").
- **Teto de R$ 999.999.999.999,99** (as colunas são `Decimal(14,2)`): o total
  mensal do rascunho, do aditivo e da aprovação de licenças (pacote +
  adicionais × preço) e cada item e o total da fatura (avulsa, recálculo,
  item lançado ou removido) são conferidos antes de gravar; acima, 422
  `AMOUNT_TOO_LARGE`. No gerador, o contrato acima do teto vai ao Sentry sem
  tentar o INSERT (não gasta número). Antes de 18/10/2026 a soma estourava no
  Postgres e virava 500.

### E-mails: reserva e liberação

Cada lembrete tem um `dedupeKey` único no `BillingEvent`:

- `invoice:<id>:due-reminder` — vencimento;
- `document:<id>:pending-reminder` — documento pendente.

A reserva (o `BillingEvent` com o `dedupeKey`) é gravada **antes** do envio.
Chave repetida quer dizer que outro tick já mandou: não envia. Se o Resend
recusa (o SDK devolve `error` sem lançar) ou a chamada falha, a reserva é
apagada e o próximo tick tenta de novo; é a única exclusão de `BillingEvent`
permitida. Sem `RESEND_API_KEY` ou sem destinatário, nada é gravado, e o
lembrete ainda sai quando a chave entrar. O Resend recebe o mesmo
`dedupeKey` como `idempotencyKey`. O lembrete de suspensão do 017 usa este
mesmo envio; o **aviso** de suspensão, não: ele grava depois de enviar (ver
"Inadimplência e bloqueio").

### Fim do contrato

- **Cancelar** (ficha do cliente › Contrato › Encerramento): o contrato termina
  no último dia do mês do pedido, em São Paulo, e esse mês é cobrado (decisão
  6). O agendamento cancela os documentos enviados que ainda aguardavam aceite.
  "Desativar a empresa também" vem marcado (D7). Pode ser desfeito até o último
  dia do mês (D8); os documentos cancelados não voltam.
- **D6. No dia seguinte ao fim**, o agendador, numa transação só: passa o
  contrato a CANCELLED, desliga a Inteligência (é o contrato que a liga desde o
  014), cancela documentos enviados que tenham sobrado e, com a opção marcada,
  desativa a empresa (e para o auto-sync). Antes do 017, empresa desativada
  ainda não perde o acesso: até lá, vale o processo da §12.4 acima.
- A Addere rescindindo (§12.2): o sistema sempre encerra no último dia do mês
  em que o cancelamento é registrado. Registre-o no mês cujo último dia caia pelo
  menos 30 dias depois do aviso.

### Retenção

Fatura é registro fiscal: nenhuma `Invoice` nem `InvoiceItem` de fatura paga é
apagada, e o encerramento do contrato não apaga nada. O número da fatura é
sequencial e global, interno (pode ter buraco quando duas criações disputam a
mesma competência); o número fiscal é o da NF, lançado à mão.

## Inadimplência e bloqueio (plano 017)

O contrato (§6.5 e §6.6) promete duas coisas sobre atraso: o aviso de
suspensão, com a data prevista, enviado com no mínimo 10 dias corridos de
antecedência; e que a suspensão não apaga dados. O sistema garante as duas.

### O aviso de suspensão

- Sai no primeiro tick a partir do dia seguinte ao vencimento, para cada
  fatura em aberto, vencida e com total maior que zero, de empresa ativa. Vai
  ao contato de cobrança e aos ADMINs ativos (`billingRecipients`).
- **Data prevista = max(vencimento + dias, envio + 10 dias corridos).** Os
  dias são o `overdueBlockDays` do contrato da empresa ou, sem ele, o padrão de
  Pacotes e regras (15). O piso de 10 dias é a constante `MIN_NOTICE_DAYS` em
  `apps/api/src/modules/billing/overdue-block.ts`, não configuração: mudar
  exige aditivo ao contrato, não um campo na tela.
- A data é calculada no envio e gravada no evento. Mudar `overdueBlockDays`
  depois vale só para avisos futuros; para adiar uma suspensão já avisada,
  use "Liberar até…".
- **O aviso só conta se foi entregue.** O evento (`SUSPENSION_NOTICE_SENT`,
  `dedupeKey` `invoice:<id>:suspension-notice`) é gravado **depois** de o Resend
  aceitar o envio (`sendBillingEmailThenRecord`). Falhou o envio, ou não há
  destinatário: nada é gravado, e sem aviso gravado não há bloqueio. Sem
  destinatário, a empresa nunca será bloqueada por essa fatura enquanto
  ninguém puder ser avisado, e isso é avisado uma vez por fatura: o evento
  `SUSPENSION_NOTICE_NO_RECIPIENT` ("Aviso de suspensão sem destinatário" no
  histórico da ficha, `dedupeKey` `invoice:<id>:suspension-notice-no-recipient`)
  e um erro no Sentry com o `companyId`. Até 18/10/2026 o Sentry recebia o
  mesmo erro a cada hora, para sempre. O pior caso (o processo cair entre o
  envio e a gravação) é o cliente receber o aviso de novo.
- O payload guarda a fatura, a data prevista e a quantidade de destinatários,
  nunca os endereços.

### O lembrete

Um só por aviso (`SUSPENSION_REMINDER_SENT`, `dedupeKey`
`invoice:<id>:suspension-reminder`), de 1 a 3 dias antes da data prevista, se
a fatura continua em aberto e nenhuma liberação cobre a data. Não é condição
de bloqueio e usa o envio com reserva do 016.

### O bloqueio por atraso

- Só acontece com o **bloqueio automático** ligado (`autoBlockEnabled`, switch
  em Gestão Addere › Pacotes e regras; nasce desligado) e sem liberação
  vigente, e só com uma fatura em aberto cujo aviso foi gravado há 10 dias
  corridos ou mais **e** cuja data prevista chegou (`overdueBlockHolds`). Sem
  aviso gravado, nunca, por mais atrasada que esteja a fatura.
- É o agendador que bloqueia (`reconcileCompanyBlock`, o único lugar do
  código que grava o motivo `OVERDUE`). Ele também libera, no tick seguinte, o
  bloqueio que deixou de se sustentar.
- O bloqueio é **por rota** e não apaga nada. A API responde 403
  `COMPANY_BLOCKED` às rotas de negócio; login, refresh e logout nunca são
  bloqueados, e `/auth/me`, `/auth/me/permissions` e `/billing/me/*` continuam
  abertos (`config.allowBlockedCompany`). Não acrescente rota a essa lista sem
  decisão: `/help` e `/pilot/events` ficam bloqueados de propósito.
- O SUPERADMIN nunca é bloqueado. O ADMIN do cliente entra no painel e só vê
  Contrato e Plano e cobrança, com a faixa em tom de perigo. Vendedor e gerente
  veem "Acesso suspenso" no app e no painel; a fila de pedidos do app espera,
  sem gastar tentativa, e sai quando o acesso volta.
- **Desligar o bloqueio automático é o rollback**: no tick seguinte (até 1
  hora) todo bloqueio por atraso é liberado, e nenhum novo acontece.
- **Empresa desativada também perde o acesso** (decisão 3), com o motivo
  `INACTIVE`, que tem precedência: pagar não devolve o acesso, reativar sim. Por
  isso "Desativar empresa" pede confirmação. Atraso de pagamento não passa por
  ali: segue o aviso e a suspensão automática.

### Liberar e dar baixa

- **A baixa libera na hora**, na mesma transação que marca a fatura como paga.
  Com outra fatura ainda sustentando o bloqueio, ele continua. Cancelar a
  fatura também libera.
- **"Liberar até…"** (ficha do cliente, só o SUPERADMIN): limpa o bloqueio e,
  com data (de hoje a hoje + 90, em São Paulo), impede que o bloqueio por
  atraso volte até o fim daquele dia; manda ao cliente o e-mail de liberação.
  Sem data, o bloqueio volta no tick seguinte se a fatura continuar vencida.
  Falha no e-mail não desfaz a liberação.
- O histórico da ficha registra quem fez cada ação (`ACCESS_BLOCKED` e
  `ACCESS_UNBLOCKED`, com a causa: regra, baixa, cancelamento ou liberação).

### Bloqueio manual: desabilitado (15/10/2026)

O contrato só prevê suspensão por atraso, precedida do aviso de 10 dias. Não há
rota, botão nem serviço que bloqueie à mão. O motivo `MANUAL` existe no enum,
reservado: nenhum código o grava. **Ninguém grava `MANUAL` nem
`accessBlockedAt` à mão no banco** (SQL Editor do Neon) para suspender um
cliente. Um `MANUAL` encontrado foi gravado à mão: a regra não o limpa, e ele
sai pelo "Liberar até…" da ficha. Um `accessBlockedAt` sem motivo vale como
atraso e é liberado pela regra no tick seguinte, se o atraso não se sustentar.
Quando o contrato previr a hipótese (violação, risco à segurança), o bloqueio
manual volta em plano próprio, com a cláusula revisada pelo advogado.

### Com `BILLING_JOBS_ENABLED` desligado

Não sai aviso nem lembrete, e não há bloqueio nem liberação automáticos. A
baixa e o "Liberar até…" continuam liberando na hora. O
`POST /admin/billing/jobs/run` roda os passos do 017 junto com os do 016.

### A Inteligência

Empresa bloqueada não roda o `nightly` nem o `refresh` (sem custo de IA); o
`PURGE` continua uma vez por dia. Liberada, o noturno retoma com catch-up
(`docs/intelligence/README.md`).

### Ordem de liberação em produção (obrigatória)

1. **API no ar com o bloqueio automático desligado**, com a migration
   `company_access_block` pelo `migrate deploy` do deploy. A partir daqui,
   empresa desativada já tem o acesso cortado: ninguém desativa empresa de
   cliente até o passo 3. Conferir no staging: `GET /auth/me` traz
   `company.access`; uma empresa de teste desativada recebe 403
   `COMPANY_BLOCKED` com `reason: 'INACTIVE'` no app e no painel, e o login e o
   F5 continuam funcionando, sem loop; "Rodar faturamento" com uma fatura
   avulsa vencida ontem manda o aviso com a data prevista a pelo menos 10 dias,
   a faixa aparece para o ADMIN e a ficha mostra "Aviso enviado".
2. **OTA no ar**, pelo `apps/mobile/docs/DEPLOY_CHECKLIST.md` (as três
   variáveis, canal `production`, runtime igual ao da loja). Conferir num
   aparelho real: fechar e reabrir o app (o OTA só troca o bundle no
   restart); no staging, com a empresa de teste desativada, o app vai para
   "Acesso suspenso", um pedido criado offline fica na fila sem falhar e é
   enviado depois de "Ativar empresa" e "Tentar novamente". Dar alguns dias de
   uso para os aparelhos em campo reiniciarem o app.
3. **Ligar o bloqueio automático** em Pacotes e regras. No staging, antes:
   deixar a fatura do passo 1 correndo até a data prevista e conferir que a
   ficha mostra "Bloqueado por atraso", a faixa do ADMIN fica em tom de perigo e
   o app vai para "Acesso suspenso"; "Liberar até…" com a data de hoje devolve o
   acesso e manda o e-mail; a baixa devolve o acesso na hora; e na Saúde dos
   dados o `nightly` e o `refresh` param e o `PURGE` aparece uma vez por dia.

A ordem existe por causa do app antigo: ele trata qualquer 4xx fora de 401, 408
e 429 como rejeição definitiva, e marcaria como falho cada pedido da fila de um
vendedor de empresa bloqueada (os pedidos não somem, mas teriam de ser
reenviados um a um, e cada um iria ao Sentry). A ordem contrária é inofensiva:
o app novo contra a API velha nunca recebe `COMPANY_BLOCKED`.

## Painel — definição dos indicadores

Plano 018. O Painel (`/gestao`, Gestão Addere › Painel) é a home do SUPERADMIN e
só lê: `GET /admin/billing/dashboard` faz cinco consultas
(`dashboard.service.ts`) e a soma é pura (`dashboard.ts`). Dinheiro somado em
`Prisma.Decimal` na API e enviado como string com duas casas; o web só formata.
Hoje é o dia civil de São Paulo (`ymdSaoPaulo`); vencimento, competência e
data da baixa são `@db.Date`, lidos em UTC (`dateToYmdUtc`). Fatura cancelada
não entra em nenhum número.

| Indicador | Definição |
|---|---|
| MRR contratado | Soma de `packagePrice + extraSeats × extraSeatPrice` dos **termos atuais** (`resolveCurrentTerms`) de todo contrato `ACTIVE`. Termos `PROPOSED` e `EFFECTIVE` com `effectiveFrom` no futuro não contam; contrato cancelado sai. |
| MRR faturável | O mesmo, só dos contratos com `isBillableNow`: mês corrente ≥ mês da `firstBilledCompetence`. Fica de fora o mês do aceite (mesmo com carência 0) e a carência. O cartão diz quantos ativos estão fora da soma. |
| Clientes por situação | `deriveClientStatus` de toda empresa, contado por situação; as sete sempre aparecem. É a mesma função da lista e da ficha. |
| Licenças | Só contratos `ACTIVE`: usadas = vendedores e gerentes ativos (`SALESPERSON`); limite = `includedSeats + extraSeats` dos termos atuais (no Ilimitado, a quantidade digitada). |
| Perto do limite | Contrato `ACTIVE` com `usadas × 100 ≥ limite × 90`, em conta inteira. Do mais ocupado ao menos; acima do limite fica no topo (decisão 5). |
| A receber | Faturas `OPEN`: quantidade e soma do total. |
| Vencido | Faturas `OPEN` com vencimento anterior a hoje (`isInvoiceOverdue`; vence hoje não é vencida). Lista do vencimento mais antigo para o mais novo. |
| Vence em 15 dias | Faturas `OPEN` que vencem de hoje até daqui a 15 dias, inclusive. |
| Recebido no mês | Faturas `PAID` com a baixa no mês corrente: soma do valor da baixa. |
| Aguardando aceite | Documentos `SENT` (contrato **e** aditivo), do envio mais antigo. Não é a situação "Aguardando aceite", que só conta o primeiro contrato: cliente ativo com aditivo pendente continua "Em dia". |
| Solicitações pendentes | Pedidos de licenças `PENDING`, do mais antigo. |
| Receita 12 meses | Os 12 meses **fechados** antes do corrente (em out/2026, de out/2025 a set/2026). Faturado = total das faturas não canceladas daquela competência; recebido = valor da baixa das pagas naquele mês. A competência corrente ainda não foi faturada e entraria como zero. |

As listas trazem no máximo cinco itens, e o título traz o total.

**MRR e fatura não batem no mês da mudança, e isso está certo.** O MRR usa os
termos atuais; a fatura usa os termos da competência. Um aditivo aceito no dia
15 muda o MRR na hora e a fatura só na competência seguinte.

**A baixa conta no dia informado.** O `paidAt` é o dia civil digitado na baixa
(`@db.Date`). Lido pelo fuso de São Paulo, a baixa do dia 1 (meia-noite UTC)
cairia no mês anterior; por isso o mês da baixa sai de `dateToYmdUtc`.

### Situação do cliente: precedência

Uma função só, `deriveClientStatus` (`packages/types/src/billing.ts`), com
hoje em São Paulo, os vencimentos das faturas `OPEN` e o motivo de bloqueio do
`resolveCompanyAccess` (o mesmo do `authenticate`). A lista de Clientes, a
ficha e o Painel leem a mesma função; o teste em tabela de
`billing-rules.test.ts` é o contrato.

| Ordem | Situação | Quando |
|---|---|---|
| 1 | Bloqueado | motivo `OVERDUE` ou `MANUAL` |
| 2 | Vencido | alguma fatura `OPEN` com vencimento anterior a hoje (inclusive de cliente cancelado ou em carência) |
| 3 | Cancelado | contrato `CANCELLED`, mesmo com a empresa desativada |
| 4 | Bloqueado | empresa desativada (`INACTIVE`) sem contrato cancelado |
| 5 | Aguardando aceite | contrato `PENDING_ACCEPTANCE` |
| 6 | Em carência | carência > 0 e mês corrente antes da `firstBilledCompetence` |
| 7 | Em dia | contrato `ACTIVE` fora da carência |
| 8 | Sem contrato | sem contrato, ou contrato `DRAFT` |

A liberação manual do 017 (`blockExemptUntil`) não esconde a dívida: empresa
liberada com fatura vencida é "Vencido". Fatura vencida de total zero também
deixa o cliente "Vencido" (é a mesma regra da tela de Faturas), embora não gere
aviso nem sustente bloqueio.
