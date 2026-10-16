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
  proxy, pôr `TRUST_PROXY_HOPS=2` no serviço e repetir. Se continuar errado,
  não publicar o contrato em produção.
- O valor também está no `render.yaml` (`'1'`): ao mudar no painel do Render,
  mudar lá também, senão o próximo sync do blueprint volta o valor.

### Levar um cliente às condições gerais novas

- Aditivo com "Levar às condições gerais publicadas": o documento carrega o
  aditivo e, como anexo, o contrato consolidado na versão nova, no mesmo hash.
- Sempre com "vale a partir de" ≥ envio + 30 dias, mesmo a pedido da Empresa.
- Só com um modelo de aditivo que preveja o anexo, validado pelo advogado. O
  aditivo v1 diz que as demais cláusulas não mudam e **não** serve para isso.
