-- Contrato de licença de uso e aceite eletrônico (plano 014): modelos de
-- texto versionados e os documentos enviados para aceite, com o texto
-- congelado, o SHA-256 e o registro do aceite. Cria tipos e tabelas e
-- acrescenta duas colunas a tabelas do plano 013: o aditivo a pedido da
-- Empresa nos termos e o administrador indicado no contrato.
-- Dados: as versões v1 do contrato e do aditivo, em rascunho.

-- CreateEnum
CREATE TYPE "ContractDocumentKind" AS ENUM ('CONTRACT', 'AMENDMENT');

-- CreateEnum
CREATE TYPE "ContractTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContractDocumentStatus" AS ENUM ('SENT', 'ACCEPTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "billing_company_contracts" ADD COLUMN     "designatedAdminId" TEXT;

-- AlterTable
ALTER TABLE "billing_contract_terms" ADD COLUMN     "requestedByClient" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "billing_contract_templates" (
    "id" TEXT NOT NULL,
    "kind" "ContractDocumentKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ContractTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "body" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_contract_documents" (
    "id" TEXT NOT NULL,
    "kind" "ContractDocumentKind" NOT NULL,
    "status" "ContractDocumentStatus" NOT NULL DEFAULT 'SENT',
    "renderedBody" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT NOT NULL,
    "lastEmailAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "acceptedByName" TEXT,
    "acceptedByEmail" TEXT,
    "acceptedIp" TEXT,
    "acceptedUserAgent" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "termsId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "conditionsTemplateId" TEXT,

    CONSTRAINT "billing_contract_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_contract_templates_kind_status_idx" ON "billing_contract_templates"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_contract_templates_kind_version_key" ON "billing_contract_templates"("kind", "version");

-- CreateIndex
CREATE INDEX "billing_contract_documents_companyId_status_idx" ON "billing_contract_documents"("companyId", "status");

-- CreateIndex
CREATE INDEX "billing_contract_documents_contractId_sentAt_idx" ON "billing_contract_documents"("contractId", "sentAt");

-- AddForeignKey
ALTER TABLE "billing_company_contracts" ADD CONSTRAINT "billing_company_contracts_designatedAdminId_fkey" FOREIGN KEY ("designatedAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_contract_documents" ADD CONSTRAINT "billing_contract_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_contract_documents" ADD CONSTRAINT "billing_contract_documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "billing_company_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_contract_documents" ADD CONSTRAINT "billing_contract_documents_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "billing_contract_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_contract_documents" ADD CONSTRAINT "billing_contract_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "billing_contract_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_contract_documents" ADD CONSTRAINT "billing_contract_documents_conditionsTemplateId_fkey" FOREIGN KEY ("conditionsTemplateId") REFERENCES "billing_contract_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Versões v1 em rascunho. Corpo de docs/billing/*-v1.md entre os marcadores
-- de texto publicável. Publicar exige o OK do advogado e tirar as marcas
-- [[REVISAR]] no painel (Gestão Addere › Modelos de contrato).
INSERT INTO "billing_contract_templates" ("id", "kind", "version", "status", "body", "changeNote", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text, 'CONTRACT', 1, 'DRAFT',
$contrato_v1$
# CONTRATO DE LICENÇA DE USO DO ADDERE

Este Contrato é formado pelo quadro-resumo e pelas condições gerais que o seguem. Em caso de divergência entre os dois, prevalece o quadro-resumo. [[REVISAR: preâmbulo novo; o modelo não tem quadro-resumo]]

## QUADRO-RESUMO

### Contratada

- **Razão social:** {{contratada.razaoSocial}}
- **CNPJ:** {{contratada.cnpj}}
- **Endereço:** {{contratada.endereco}}
- **Encarregado pelo tratamento de dados pessoais:** {{contratada.encarregado}}
- **Contato comercial e contratual:** {{contratada.emailContato}}
- **Suporte aos Usuários:** {{contratada.emailSuporte}}

### Empresa Contratante

- **Razão social:** {{cliente.razaoSocial}}
- **Nome fantasia:** {{cliente.nomeFantasia}}
- **CNPJ:** {{cliente.cnpj}}
- **Endereço:** {{cliente.endereco}}
- **Representante legal:** {{cliente.representanteNome}}, CPF {{cliente.representanteCpf}}, {{cliente.representanteCargo}}
- **E-mail de cobrança:** {{cliente.emailCobranca}}
- **Administrador indicado** (aceita este Contrato, os termos aditivos e os pedidos de licenças adicionais): {{cliente.administradorNome}}, {{cliente.administradorEmail}}

### Licença

- **Produto:** Addere, aplicativo de força de vendas e painel web integrados ao ERP TOTVS Protheus
- **Pacote:** {{licenca.pacote}}
- **Tipo de licença:** {{licenca.tipo}}
- **Camada de Inteligência:** {{licenca.inteligencia}}
- **Licenças do pacote:** {{licenca.quantidade}}
- **Licenças adicionais:** {{licenca.adicionais}}
- **Total de licenças:** {{licenca.total}}

### Valores mensais

- **Pacote:** {{valores.pacote}} ({{valores.pacoteExtenso}})
- **Cada licença adicional:** {{valores.adicional}} ({{valores.adicionalExtenso}})
- **Total mensal:** {{valores.mensal}} ({{valores.mensalExtenso}})

### Início e cobrança

- **Início do Contrato:** a data do aceite eletrônico deste Contrato (§3.7 e §14).
- **Regra de cobrança:** mensal e pós-paga. A fatura de cada competência (mês civil) é emitida no início do mês seguinte e vence no dia {{cobranca.diaVencimento}} desse mês.
- **Carência:** {{cobranca.carenciaMeses}} mês(es), contados depois do mês do aceite. Zero significa sem carência.
- **Primeira fatura:** o mês do aceite não é cobrado; depois dele correm os meses de carência, se houver; a primeira fatura é a da competência seguinte, emitida no início do mês posterior a ela e vencendo no dia {{cobranca.diaVencimento}}.
- **Suspensão por atraso:** pode ocorrer a partir de {{cobranca.diasParaSuspensao}} dias de atraso, nunca antes de 10 (dez) dias corridos do aviso do §6.5.
- **Contato de cobrança:** {{cliente.emailCobranca}}

[[REVISAR: quadro-resumo inteiro é novo; início, pós-pago, carência, primeira fatura e suspensão seguem as regras comerciais de 15/10/2026]]

### Documento

- **Emitido em:** {{documento.dataEmissao}}
- **Versão das condições gerais:** {{documento.versaoModelo}}

## CONDIÇÕES GERAIS

### 1. O que é o Addere

O Addere é um aplicativo de força de vendas e um painel web integrados ao ERP da Empresa Contratante. O núcleo inclui registro de pedidos, inclusive sem conexão, com fila de sincronização; consulta de clientes, produtos e metas; e geração do PDF do pedido. Quando a licença inclui a Camada de Inteligência, o Addere também calcula o plano do dia, a rota de visitas, o resumo antes da visita e sugestões de mensagem ao cliente. [[REVISAR: descrição do produto, da seção 3 dos Termos de Uso do Addere]]

O Addere é fornecido como software (SaaS), acessível por navegador e por aplicativo, sob licença de uso mensal.

O Addere não é um produto oficial da TOTVS S.A. É desenvolvido de forma independente, com integração ao ERP Protheus. TOTVS e Protheus são marcas de seus titulares. [[REVISAR: aviso de marca, da seção 3 dos Termos de Uso do Addere]]

### 2. Quem é quem

- **Addere:** GH ENGENHARIA LTDA - ME, CNPJ 07.841.407/0001-90, com sede na Rua Débora da Silva Braga, 55, Bessa, João Pessoa/PB, CEP 58037-350, fornecedora do software.
- **Empresa Contratante:** pessoa jurídica identificada no quadro-resumo, que usa o ERP na sua operação comercial, contrata o Addere e é responsável pelos dados que insere e pela operação que conduz. [[REVISAR: o modelo admitia pessoa física; aqui é a empresa que usa o Protheus]]
- **Usuários:** as pessoas que a Empresa Contratante cadastra no sistema, cada uma com um papel (administrador, gerente, vendedor) que define o que pode ver e fazer.
- **Clientes da Empresa Contratante:** as pessoas físicas e jurídicas a quem a Empresa Contratante vende, cujos dados vêm do ERP dela. **Não são parte deste Contrato** e não têm relação contratual com a Addere. [[REVISAR: descreve os clientes da Empresa no lugar do cliente final do modelo]]
- **ERP:** o sistema TOTVS Protheus da Empresa Contratante, ao qual o Addere se integra. [[REVISAR: definição da seção 2 dos Termos de Uso do Addere]]
- **Camada de Inteligência:** módulo incluído conforme o tipo de licença do quadro-resumo, que calcula o plano do dia e gera textos de apoio à venda. [[REVISAR: definição da seção 2 dos Termos de Uso do Addere, ligada ao tipo de licença]]

### 3. Contratação, pacotes e vigência

**3.1** A contratação se dá por pacote de licenças, conforme o quadro-resumo. Cada pacote tem uma quantidade de licenças e um valor mensal total; no pacote Ilimitado, a quantidade é a indicada no quadro-resumo. [[REVISAR: pacote com quantidade e valor total no lugar do plano do catálogo]]

**3.2** Cada Usuário ativo com perfil de vendedor ou de gerente ocupa uma licença. Usuário com perfil de administrador não ocupa licença. Desativar um Usuário libera a licença dele na hora. [[REVISAR: regra de consumo de licença]]

**3.3** O total de licenças do quadro-resumo é o limite de Usuários que ocupam licença ativos ao mesmo tempo. Atingido o limite, o sistema não ativa outro Usuário que ocupe licença até que uma licença seja liberada, que licenças adicionais sejam contratadas (§3.5) ou que o pacote seja alterado por termo aditivo (§13). [[REVISAR: limite de licenças; no modelo, ultrapassar o limite exigia mudança de plano]]

**3.4** Além do pacote, a Empresa Contratante pode contratar licenças adicionais avulsas, uma a uma, pelo valor unitário do quadro-resumo. [[REVISAR: licença adicional avulsa]]

**3.5** O pedido de licenças adicionais feito no painel do Addere pelo administrador indicado no quadro-resumo, com o preço exibido na tela, vale como contratação dessas licenças, sem termo aditivo. As licenças pedidas são liberadas depois da aprovação da Addere e cobradas a partir do mês seguinte ao da liberação. [[REVISAR: contratação de adicionais por pedido no painel, sem aditivo]]

**3.6** O tipo de licença do quadro-resumo define se a Camada de Inteligência está incluída. No tipo Padrão, ela não está incluída; no tipo Com Inteligência, está incluída para toda a Empresa Contratante. A Camada de Inteligência é ligada e desligada conforme o tipo de licença vigente, e a troca de tipo é feita por termo aditivo (§13). [[REVISAR: Inteligência definida pelo tipo de licença, e não mais pelo administrador]]

**3.7** Este Contrato só produz efeitos depois do aceite eletrônico do §14, e a data do aceite é a data de início do Contrato. Antes do aceite, não há, por força dele, limite de licenças, cobrança nem mudança na Camada de Inteligência. [[REVISAR: início na data do aceite]]

**3.8** A contratação é mensal e se renova automaticamente enquanto não for cancelada.

**3.9** O cancelamento pode ser feito a qualquer tempo e tem efeito ao fim do mês civil em que for pedido, mês que é cobrado normalmente. Não há multa nem fidelidade. [[REVISAR: pós-pago; o fim do ciclo já pago do modelo virou o fim do mês do pedido, que é cobrado]]

**3.10** A Empresa Contratante pede o cancelamento por escrito, ao e-mail de contato comercial e contratual do quadro-resumo. [[REVISAR: forma do pedido de cancelamento]]

### 4. Contas de acesso

**4.1** Cada pessoa tem uma conta individual. **É vedado o compartilhamento de senha** — a identificação de quem registrou cada pedido e cada visita é o que dá valor ao histórico, e ela depende disso. [[REVISAR: a justificativa do modelo citava serviços lançados e baixas de pagamento]]

**4.2** A Empresa Contratante é responsável por manter atualizada a lista de quem tem acesso, e por revogar o acesso de quem deixar a operação. A Addere disponibiliza a função; o uso é da Empresa Contratante.

**4.3** A Empresa Contratante responde pelos atos praticados nas contas dos seus Usuários.

### 5. Pedidos e relação com os clientes da Empresa Contratante

**5.1** Os valores, prazos, reajustes, descontos e eventuais encargos cobrados dos clientes da Empresa Contratante são definidos pela Empresa Contratante. A Addere apenas executa o que a Empresa Contratante configurou.

**5.2** A Addere não é parte na relação entre a Empresa Contratante e os clientes dela, não garante o pagamento, não presta serviço de cobrança em nome próprio e não assume risco de crédito.

**5.3** A Empresa Contratante é responsável pela exatidão do que fatura — inclusive pelos pedidos lançados pela sua equipe — e pelo cumprimento das obrigações fiscais decorrentes. [[REVISAR: serviços lançados virou pedidos lançados]]

**5.4** O pedido registrado no Addere só é recebido pelo ERP da Empresa Contratante depois de sincronizado (§9.2). A partir daí, o processamento, o faturamento e a entrega da venda são da Empresa Contratante, e a Addere não é parte da venda. [[REVISAR: pedido recebido pelo ERP só depois de sincronizado, da seção 10 dos Termos de Uso do Addere]]

**5.5 Direito de regresso.** A divisão de responsabilidades deste Contrato vale entre a Addere e a Empresa Contratante, mas não obriga os clientes da Empresa Contratante, que não são parte dele e podem demandar a Empresa Contratante e a Addere em conjunto. Se uma das partes indenizar cliente da Empresa Contratante ou terceiro por fato atribuível, no todo ou em parte, à outra, poderá cobrar dela o que pagou, na proporção da responsabilidade de cada uma, incluídas custas e honorários. [[REVISAR: 7.4 do modelo sem a instituição de pagamento e com os clientes da Empresa como terceiros]]

### 6. Preço e pagamento da licença

**6.1** A contratação da Empresa Contratante é cobrada mensalmente, conforme o pacote e as licenças adicionais contratados, na data de vencimento acordada.

**6.2** A cobrança é pós-paga. A fatura de cada competência (mês civil) é emitida pela Addere no início do mês seguinte, fica disponível aos administradores da Empresa Contratante no painel do Addere e vence no dia {{cobranca.diaVencimento}} desse mês. O valor da fatura é o contratado para a competência, e não o uso. O pagamento é feito fora do sistema, pelos meios indicados na fatura. [[REVISAR: ciclo pós-pago, fatura emitida pela Addere e paga por fora]]

**6.3** O mês do aceite não é cobrado. Depois dele correm os meses de carência do quadro-resumo ({{cobranca.carenciaMeses}}), também sem cobrança. A primeira fatura é a da competência seguinte, emitida no início do mês posterior a ela e vencendo no dia {{cobranca.diaVencimento}}. [[REVISAR: primeira competência cobrada e carência]]

**6.4** A mudança no total de licenças, no pacote, no tipo de licença ou nos valores vale para o limite de licenças e para a Camada de Inteligência assim que passa a valer, e entra na cobrança a partir da competência seguinte; a competência em que ela passa a valer é cobrada pelas condições anteriores. [[REVISAR: mudança no mês cobrada a partir do mês seguinte]]

**6.5** O atraso pode gerar lembretes automáticos e, persistindo, a **suspensão do acesso**, precedida de aviso ao contato de cobrança cadastrado pela Empresa Contratante com antecedência mínima de **10 (dez) dias corridos**, informando a data prevista da suspensão. A suspensão não apaga dados.

**6.6** A suspensão pode ocorrer a partir de {{cobranca.diasParaSuspensao}} dias de atraso, mas nunca antes de 10 (dez) dias corridos do aviso do §6.5. Durante a suspensão, os Usuários não acessam o aplicativo nem o painel, exceto os administradores da Empresa Contratante, que continuam vendo este Contrato, os termos aditivos e as faturas. O acesso é restabelecido quando a Addere registra o pagamento. [[REVISAR: prazo de suspensão do quadro-resumo e o que fica acessível durante ela]]

**6.7** Reajustes são comunicados com antecedência mínima de 30 dias, e a Empresa Contratante pode cancelar sem ônus antes da vigência do novo preço.

**6.8** O reajuste é feito por termo aditivo, na forma do §13. Se a Empresa Contratante cancelar antes da vigência do novo preço, o mês do cancelamento é cobrado pelo preço anterior. [[REVISAR: reajuste por aditivo e efeito do cancelamento no pós-pago]]

### 7. Mensagens aos clientes da Empresa Contratante

**7.1** O Addere não envia mensagens aos clientes da Empresa Contratante por conta própria. A mensagem sugerida abre no WhatsApp do Usuário ou é copiada, e o envio, assim como o seu conteúdo final, é decisão e responsabilidade do Usuário. [[REVISAR: substitui o envio automático do modelo, com base na seção 9 dos Termos de Uso do Addere]]

**7.2** A Empresa Contratante declara que possui base legal e o contato correto de cada cliente que cadastra, e responde pelo cadastro de números de terceiros.

### 8. Dados pessoais

**8.1 Papéis.** Para os fins da Lei nº 13.709/2018 (LGPD), o papel de cada parte depende do tratamento:

- **(a) A Empresa Contratante é a controladora** dos dados tratados na operação dela — os seus clientes e a atividade da sua equipe no sistema (pedidos, visitas, check-in com localização e mensagens sugeridas). [[REVISAR: lista dos dados da operação no Addere]] Nesses tratamentos, a **Addere atua como operadora**, em nome e por conta da Empresa Contratante, nos limites deste Contrato.
- **(b) A Addere é a controladora** dos tratamentos de finalidade própria: as contas de acesso ao sistema; os contatos comerciais recebidos pelo site; a cobrança da contratação da Empresa Contratante (§6), incluídos este Contrato, as faturas, os contatos de cobrança, os dados do representante legal e os registros de aceite (§14); o monitoramento de erros e de segurança do serviço; e a produção dos dados agregados e anonimizados do §11.2. [[REVISAR: sai a remissão ao 4.2 do modelo; entram contrato, faturas, contatos de cobrança, representante legal e registros de aceite]]

**8.2 Sub-operadores.** A Addere utiliza fornecedores para operar o serviço, cada um recebendo apenas o dado necessário à sua função: Neon, Render e Vercel (hospedagem), Resend (e-mails operacionais), Sentry (monitoramento de erros técnicos), Expo (geração e distribuição das versões do aplicativo), Google Maps e Apple Maps (mapa da rota de visitas), Nominatim/OpenStreetMap (geocodificação dos endereços dos clientes e mapas de fundo do painel) e Anthropic (modelo de linguagem da Camada de Inteligência, na forma do §8.9). [[REVISAR: fornecedores do Addere, da seção 5 da Política de Privacidade]] A lista atualizada consta da Política de Privacidade publicada em addere.com.br.

**8.3 Segurança.** A Addere mantém os dados isolados por Empresa Contratante, criptografados em trânsito e em repouso, com credenciais de terceiros guardadas de forma cifrada. [[REVISAR: sai o registro imutável dos eventos financeiros, que o Addere não tem]]

**8.4 Direitos dos titulares.** Pedidos de acesso, correção ou exclusão são atendidos pela Empresa Contratante, com as funções que o sistema oferece. Os dados cadastrais dos clientes vêm do ERP da Empresa Contratante e são corrigidos ou excluídos nele; a pedido da Empresa Contratante, a Addere elimina os dados pessoais do titular mantidos no Addere, ressalvados os registros mantidos na forma do §8.5. [[REVISAR: o Addere não tem a função de exclusão do modelo; os dados de clientes vêm do ERP]]

**8.5 Retenção obrigatória.** Registros de natureza fiscal e financeira (faturas, contratos, lançamentos e pagamentos) são mantidos pelo prazo exigido em lei mesmo após pedido de exclusão, **com a identificação do titular preservada, porém bloqueada**: o acesso fica restrito ao necessário para cumprir obrigação legal ou regulatória e para o exercício de direitos em processo, sem uso para nenhuma outra finalidade. Vencido o prazo legal, esses registros são eliminados ou anonimizados.

**8.6 Incidentes.** A Addere comunicará à Empresa Contratante, em até **48 (quarenta e oito) horas** contadas de quando tomar conhecimento, qualquer incidente de segurança que envolva os dados tratados por conta dela, com as informações de que dispuser naquele momento, complementadas à medida que a apuração avançar.

**8.7 Transferência internacional.** Parte dos fornecedores do §8.2 armazena ou processa dados fora do Brasil, principalmente nos Estados Unidos — entre eles Neon, Render, Vercel, Resend, Sentry, Expo, Google, Apple e Anthropic; o Nominatim/OpenStreetMap, na Europa. [[REVISAR: fornecedores do Addere e onde tratam os dados, da seção 5 da Política de Privacidade]] Essas transferências são feitas com base em cláusulas-padrão contratuais aprovadas pela Autoridade Nacional de Proteção de Dados, incorporadas aos contratos com esses fornecedores (art. 33, II, "b", da LGPD). A Empresa Contratante, como controladora dos tratamentos do §8.1(a), autoriza essas transferências.

**8.8 Encarregado.** O encarregado pelo tratamento de dados pessoais da Addere é **Gustavo Henrique Palitot Costa**, que atende titulares, Empresas Contratantes e a Autoridade Nacional de Proteção de Dados pelo canal **contato@addere.com.br**.

**8.9 Camada de Inteligência.** Quando a licença inclui a Camada de Inteligência, os textos de apoio à venda (plano do dia, resumo antes da visita e mensagem sugerida) são escritos por modelo de linguagem a partir de dados comerciais pseudonimizados. Nome, código, CNPJ, CPF, e-mail, CEP e telefone dos clientes da Empresa Contratante não são enviados ao provedor do modelo. Os textos são conferidos antes de chegar ao aplicativo; quando não passam na conferência, o aplicativo mostra o texto montado pelas regras. [[REVISAR: da seção 11 dos Termos de Uso e da seção 3.9 da Política de Privacidade do Addere]]

### 9. Disponibilidade, suporte e limites

**9.1** Não são de responsabilidade da Addere as interrupções decorrentes de falha de internet, de rede ou de energia da própria Empresa Contratante, de dispositivos da Empresa Contratante ou de seus Usuários, do ERP da Empresa Contratante e dos endpoints de integração mantidos por ela (§10.5), [[REVISAR: acréscimo do ERP e dos endpoints de integração mantidos pela Empresa Contratante]] nem as decorrentes de caso fortuito ou força maior (art. 393 do Código Civil).

**9.2** O aplicativo funciona sem internet para registro de pedidos em campo, sincronizando quando a conexão volta. Enquanto não sincronizar, o pedido não aparece para os demais Usuários e não é recebido pelo ERP da Empresa Contratante. [[REVISAR: serviços viraram pedidos, e entra o recebimento pelo ERP]]

**9.3** Se o aplicativo for desinstalado ou os dados do aparelho forem apagados antes da sincronização, os pedidos pendentes podem ser perdidos. [[REVISAR: da seção 10 dos Termos de Uso do Addere]]

**9.4** A Addere não responde por decisões operacionais ou comerciais tomadas com base nas informações do sistema.

**9.5** Na Camada de Inteligência, situações, prioridades e valores esperados são calculados por regras determinísticas a partir dos dados do ERP. As sugestões são apoio à decisão: não garantem venda e não substituem o julgamento do Usuário e da Empresa Contratante. A qualidade das sugestões depende da qualidade dos dados do ERP. [[REVISAR: da seção 11 dos Termos de Uso do Addere]]

**9.6** Os Usuários são atendidos pelo e-mail de suporte do quadro-resumo, {{contratada.emailSuporte}}; os assuntos comerciais e contratuais, pelo e-mail de contato, {{contratada.emailContato}}. [[REVISAR: canais de suporte, da seção 12 dos Termos de Uso do Addere, sem prazo de atendimento]]

**9.7** A Addere compromete-se a manter o serviço disponível em, no mínimo, **99,5% de cada mês civil**. Não entram no cálculo as janelas de manutenção comunicadas previamente nem as hipóteses do §9.1.

**9.8** Descumprida a meta do §9.7 em um mês civil, a Empresa Contratante tem direito a **crédito proporcional ao tempo de indisponibilidade** daquele mês, abatido na fatura da competência seguinte. O crédito corresponde à fração entre os minutos de indisponibilidade e o total de minutos do mês, aplicada ao valor mensal da licença daquele mês — o que o limita, por construção, a um valor mensal. [[REVISAR: mensalidade do ciclo seguinte virou fatura da competência seguinte, porque o Addere é pós-pago]]

**9.9 Natureza do crédito.** Para a Empresa Contratante que não se enquadre como consumidora, o crédito do §9.8 é o **limite máximo da indenização** devida pela Addere por indisponibilidade do serviço, ressalvados os casos de dolo ou culpa grave. Para a Empresa Contratante que se enquadre como consumidora (art. 2º do Código de Defesa do Consumidor), o crédito é compensação pela indisponibilidade e **não limita** a indenização a que ela tenha direito.

**9.10 Crédito sem fatura seguinte.** Se não houver fatura seguinte em que abater o crédito, por ter a contratação sido encerrada, o valor é pago à Empresa Contratante em dinheiro, por Pix para conta de titularidade dela, em até **30 (trinta) dias** contados do encerramento. [[REVISAR: ciclo seguinte virou fatura seguinte]]

### 10. Obrigações da Empresa Contratante

**10.1** Fornecer dados verdadeiros no cadastro da Empresa Contratante, dos Usuários e dos clientes, e mantê-los atualizados.

**10.2** Usar o sistema conforme a lei, sem inserir conteúdo ilícito ou dado de terceiro sem base legal.

**10.3** Não tentar contornar limites do pacote, acessar dados de outra Empresa Contratante, nem submeter o sistema a engenharia reversa.

**10.4** Manter sob sigilo as credenciais de acesso e comunicar imediatamente qualquer uso não autorizado de que tome conhecimento.

**10.5** Manter o ERP com REST habilitado e expor os endpoints de integração necessários; com a Camada de Inteligência, também o endpoint de SQL genérico, configurado com o seu consultor Protheus. [[REVISAR: obrigação de ERP, da seção 8 dos Termos de Uso do Addere]]

**10.6** Fornecer e manter válidas as credenciais de integração, e responder pela exatidão dos dados cadastrais e comerciais do ERP. [[REVISAR: obrigação de ERP, da seção 8 dos Termos de Uso do Addere]]

**10.7** Ter base legal para a leitura de localização no check-in de visita e informar os seus Usuários sobre ela. [[REVISAR: localização no check-in, da seção 8 dos Termos de Uso do Addere]]

**10.8** Garantir que os seus Usuários conheçam e cumpram os Termos de Uso do Addere (§15). [[REVISAR: da seção 8 dos Termos de Uso do Addere]]

### 11. Propriedade intelectual

**11.1** O software, a marca, o desenho das telas e a documentação são da Addere. Este Contrato concede licença de uso, não transferência de propriedade.

**11.2** Os **dados inseridos pela Empresa Contratante são da Empresa Contratante**. A Addere os usa apenas para prestar o serviço e cumprir obrigações legais, e pode usar dados agregados e **anonimizados** — que não identifiquem Empresa Contratante, cliente dela ou pessoa — para melhorar o produto. [[REVISAR: animal virou cliente dela]]

**11.3** A licença de uso é limitada, não exclusiva e intransferível, vale durante a vigência deste Contrato e se restringe às atividades comerciais da Empresa Contratante. Não é permitido sublicenciar, revender ou ceder o acesso a terceiros, nem usar o Addere para desenvolver produto concorrente. [[REVISAR: alcance da licença, da seção 5 dos Termos de Uso do Addere]]

### 12. Vigência, rescisão e saída

**12.1** Este Contrato vigora enquanto a contratação estiver ativa.

**12.2** Qualquer das partes pode rescindir mediante aviso; a Addere o fará com antecedência mínima de 30 dias, salvo em caso de uso ilícito ou violação grave.

**12.3** Encerrada a relação, a Empresa Contratante pode solicitar cópia dos seus dados em formato legível por máquina no prazo de **30 (trinta) dias** contados do encerramento. A Addere entrega a cópia em até **15 (quinze) dias corridos** contados da solicitação. Vencido o prazo de 30 dias sem solicitação, os dados são eliminados, ressalvado o §8.5.

**12.4** Encerrado o Contrato, o acesso ao Addere é bloqueado, e os pedidos já sincronizados permanecem no ERP da Empresa Contratante. [[REVISAR: da seção 16 dos Termos de Uso do Addere]]

### 13. Alterações deste Contrato

Qualquer alteração deste Contrato será comunicada à Empresa Contratante com antecedência mínima de 30 dias e só passa a valer para ela depois de aceita em **termo aditivo aceito eletronicamente no painel do Addere**. Enquanto o aditivo não for aceito, permanece aplicável a versão anteriormente aceita. A Empresa Contratante que não concordar com a alteração pode cancelar a contratação sem ônus. [[REVISAR: termo aditivo assinado virou termo aditivo aceito eletronicamente no painel; a revisão do modelo admitiu as duas formas]]

São alterações deste Contrato, para esse fim, a troca de pacote, de tipo de licença ou de valores, o reajuste e a adoção de nova versão destas condições gerais. A antecedência de 30 dias não se aplica ao termo aditivo que não aumente o valor do pacote nem o valor unitário da licença adicional e não traga nova versão destas condições gerais, nem ao termo aditivo feito a pedido da Empresa Contratante, desde que não traga nova versão destas condições gerais: esses aditivos podem valer a partir do seu aceite. A contratação de licenças adicionais pelo painel segue o §3.5. [[REVISAR: o que é alteração e quando a antecedência de 30 dias não se aplica]]

### 14. Aceite eletrônico

**14.1** Este Contrato e os seus termos aditivos são aceitos eletronicamente no painel do Addere pelo administrador indicado pela Empresa Contratante no quadro-resumo, depois de exibido o texto inteiro e de marcada a concordância. Quem aceita declara ter poderes para obrigar a Empresa Contratante. As partes admitem esse meio de comprovação da autoria e da integridade do documento, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001. [[REVISAR: aceite eletrônico pelo administrador indicado, no lugar do contrato assinado do modelo]]

**14.2** No aceite, o sistema registra o Usuário que aceitou, a data e a hora, o endereço IP, a identificação do navegador e o resumo criptográfico (hash SHA-256) do texto aceito. O texto aceito fica congelado: mudanças posteriores no modelo não o alteram. [[REVISAR: o que o sistema registra no aceite]]

**14.3** O pedido de licenças adicionais do §3.5 é registrado do mesmo modo, com o texto exibido na tela no momento do pedido. [[REVISAR: registro do pedido de licenças adicionais]]

**14.4** Durante a vigência deste Contrato, a Empresa Contratante pode imprimir ou salvar em PDF, pelo painel do Addere, este Contrato e os termos aditivos aceitos, com os dados do aceite. [[REVISAR: cópia do documento aceito]]

### 15. Relação com os Termos de Uso e a Política de Privacidade

Os Termos de Uso e a Política de Privacidade do Addere, publicados em addere.com.br, valem para os Usuários. Para a Empresa Contratante, este Contrato prevalece sobre eles naquilo em que forem diferentes. [[REVISAR: hierarquia entre o Contrato e os documentos públicos]]

### 16. Lei aplicável e foro

Aplica-se a lei brasileira. Fica eleito o foro da comarca de **João Pessoa, Paraíba** — sede da Addere —, com renúncia a qualquer outro, ressalvada a hipótese de contratante consumidor, caso em que prevalece o foro legalmente assegurado a ele.
$contrato_v1$,
  '1.1-minuta (15/10/2026): adaptado da minuta 1.6 do BaiaCerta, revisão jurídica de 04/10/2026, com as decisões de 15/10/2026',
  NOW(), NOW()
);

INSERT INTO "billing_contract_templates" ("id", "kind", "version", "status", "body", "changeNote", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text, 'AMENDMENT', 1, 'DRAFT',
$aditivo_v1$
# TERMO ADITIVO AO CONTRATO DE LICENÇA DE USO DO ADDERE

## PARTES

- **Contratada:** {{contratada.razaoSocial}}, CNPJ {{contratada.cnpj}}, com sede em {{contratada.endereco}}, doravante Addere.
- **Empresa Contratante:** {{cliente.razaoSocial}} ({{cliente.nomeFantasia}}), CNPJ {{cliente.cnpj}}, com sede em {{cliente.endereco}}, representada por {{cliente.representanteNome}}, CPF {{cliente.representanteCpf}}, {{cliente.representanteCargo}}. Administrador indicado, que aceita este termo aditivo: {{cliente.administradorNome}}, {{cliente.administradorEmail}}.

[[REVISAR: qualificação das partes pelos campos do cadastro]]

## 1. Contrato alterado

**1.1** Este termo aditivo altera o Contrato de Licença de Uso do Addere aceito eletronicamente pela Empresa Contratante em {{aditivo.contratoAceitoEm}} (o Contrato), na forma do §13 do Contrato. [[REVISAR: identificação do Contrato pela data do aceite original]]

**1.2** Motivo da alteração: {{aditivo.motivo}} [[REVISAR: motivo em texto livre do superadmin]]

## 2. O que muda

### Antes

- **Pacote:** {{aditivo.pacoteAnterior}}
- **Tipo de licença:** {{aditivo.tipoAnterior}}
- **Licenças do pacote:** {{aditivo.quantidadeAnterior}}
- **Licenças adicionais:** {{aditivo.adicionaisAnterior}}
- **Valor mensal do pacote:** {{aditivo.valorPacoteAnterior}}
- **Valor mensal de cada licença adicional:** {{aditivo.valorAdicionalAnterior}}
- **Total mensal:** {{aditivo.mensalAnterior}}

### Depois

- **Pacote:** {{licenca.pacote}}
- **Tipo de licença:** {{licenca.tipo}}
- **Camada de Inteligência:** {{licenca.inteligencia}}
- **Licenças do pacote:** {{licenca.quantidade}}
- **Licenças adicionais:** {{licenca.adicionais}}
- **Total de licenças:** {{licenca.total}}
- **Valor mensal do pacote:** {{valores.pacote}} ({{valores.pacoteExtenso}})
- **Valor mensal de cada licença adicional:** {{valores.adicional}} ({{valores.adicionalExtenso}})
- **Total mensal:** {{valores.mensal}} ({{valores.mensalExtenso}})

[[REVISAR: quadro antes e depois]]

## 3. Quando vale e como é cobrado

**3.1** As condições novas valem a partir de {{aditivo.valeAPartirDe}} ou da data do aceite deste termo aditivo, o que for posterior. Até lá, valem as condições anteriores. [[REVISAR: data em que as condições novas passam a valer]]

**3.2** A partir dessa data, as condições novas valem para o limite de licenças e para a Camada de Inteligência, e entram na cobrança a partir da competência seguinte, na forma do §6.4 do Contrato. [[REVISAR: cobrança a partir da competência seguinte]]

**3.3** Se este termo aditivo aumentar o valor do pacote ou o valor de cada licença adicional, a Empresa Contratante pode cancelar o Contrato sem ônus antes de as condições novas passarem a valer, na forma do §6.7 e do §13 do Contrato. [[REVISAR: cancelamento sem ônus antes do aumento]]

## 4. Disposições finais

**4.1** As demais cláusulas do Contrato permanecem inalteradas. [[REVISAR: manutenção das demais cláusulas]]

**4.2** Este termo aditivo é aceito eletronicamente no painel do Addere, nos mesmos termos do §14 do Contrato, com o mesmo registro do Usuário que aceitou, da data e da hora, do endereço IP, do navegador e do resumo criptográfico (hash SHA-256) do texto aceito. [[REVISAR: aceite eletrônico do aditivo]]

- **Emitido em:** {{documento.dataEmissao}}
- **Versão do modelo de aditivo:** {{documento.versaoModelo}}
$aditivo_v1$,
  '1.1-minuta (15/10/2026): modelo de aditivo, com o administrador indicado',
  NOW(), NOW()
);
