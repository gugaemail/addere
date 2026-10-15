# Contrato de Licença de Uso do Addere — modelo v1

**Versão:** 1.0-minuta
**Data:** 15/10/2026
**Origem:** minuta 1.6 dos Termos de Uso do BaiaCerta (`apps/baiacerta/docs/TERMOS-DE-USO.md`), com a
revisão jurídica de 04/10/2026 incorporada (parecer em `revisao-juridica-contrato-baiacerta.md`).
**Partes:** GH ENGENHARIA LTDA - ME (Addere) e a Empresa Contratante.
**Aceite:** eletrônico, no painel do Addere, por um administrador da Empresa Contratante (§14 do
corpo). Alterações, por termo aditivo aceito do mesmo modo (§13). O modelo do aditivo está em
`docs/billing/aditivo-contratual-v1.md`.
**No sistema:** o plano 014 grava como versão 1 do `ContractTemplate` de tipo CONTRACT, em DRAFT,
só o trecho entre os dois comentários de marcação (início e fim do texto publicável). O que está
acima e abaixo deles fica de fora.
**Fontes dos fatos do produto:** `termos.html` e `privacidade.html` do site (atualizados em
11/09/2026) e as regras comerciais do plano aprovado de 15/10/2026 (planos 013 a 018).

---

> ## ⚠️ MINUTA — AINDA NÃO PUBLICAR
>
> Este aviso, a seção "Como ler esta minuta" e o histórico de versões **não fazem parte do texto
> publicado**. O corpo fica entre os dois comentários de marcação e não cita arquivos. Todo trecho
> que não é redação da minuta 1.6 do BaiaCerta com só os nomes trocados leva uma marca REVISAR
> logo depois dele, e o sistema não publica o modelo enquanto houver uma.
>
> **Bloqueia a publicação:**
>
> 1. **§8.7 — conferir o instrumento de transferência internacional, fornecedor a fornecedor.**
>    O texto afirma que os contratos com os fornecedores incorporam as cláusulas-padrão da ANPD
>    (Resolução CD/ANPD nº 19/2024, art. 33, II, "b", da LGPD). Isso não foi conferido em nenhum
>    deles: Neon, Render, Vercel, Resend, Sentry, Expo, Google (Maps), Apple (Maps), Anthropic e
>    Nominatim/OpenStreetMap. Dois casos merecem atenção. O **Nominatim** é o serviço público da
>    OpenStreetMap Foundation, usado sob política de uso e sem contrato com a Addere, então a base
>    do art. 33, II, "b" não existe para ele: trocar o geocodificador, achar outra base do art. 33
>    ou tirá-lo do serviço. **Google Maps e Apple Maps** entram por termos de SDK, não por contrato
>    de tratamento negociado. Até a conferência, a cláusula afirma mais do que está verificado.
> 2. **Alinhar `termos.html` e `privacidade.html` do site**, para não haver dois documentos
>    públicos que se contradizem. Escopo do plano 014:
>    - Termos, seção 7: diz "cobrado por representante ativo por mês". O contrato cobra por pacote
>      de licenças, em que vendedor e gerente ocupam licença e o administrador não (§3).
>    - Termos, seção 15: exclui a "indisponibilidade [...] de provedores de terceiros". O §9.1 não
>      exclui, porque o parecer do BaiaCerta disse que essa exclusão tende a ser anulada (arts. 14,
>      25 e 51, I, do CDC; art. 424 do Código Civil).
>    - Termos, seção 16: o encerramento "segue a proposta comercial". O contrato fixa 30 dias de
>      aviso da Addere e o prazo de 30 + 15 dias para a cópia dos dados (§12).
>    - Termos, seção 13: só apresenta a Addere como operadora. O §8.1(b) a faz controladora dos
>      tratamentos próprios.
>    - Termos (seções 1 e 14) e Política (seções 1 e 2) usam "GH ENGENHARIA LTDA", sem "- ME".
>    - Política, seção 3: declarar a coleta nova (representante legal com CPF e cargo, contatos de
>      cobrança, registro do aceite com IP e navegador, pedido de licenças com IP e navegador). A
>      seção 5 confere com o §8.2.
>    - Também vale alinhar: Termos, seções 1, 7 e 12 (falam em "proposta comercial", que agora é
>      este Contrato); Termos, seção 17 ("antecedência razoável", contra os 30 dias e o aditivo do
>      §13); Política, seção 6 (genérica, depois do item 1 acima).
> 3. **Toda promessa precisa de quem a cumpra no dia da publicação** (tabela abaixo). O que
>    depende de plano ainda não entregue (015, 016, 017) é cumprido à mão até ele entrar, e isso
>    precisa estar escrito. O processo de incidentes em 48 h e o de cópia e eliminação dos dados
>    moram em `docs/billing/README.md`, que **ainda não existe**: escrevê-lo antes de publicar.
>
> **Para o advogado validar.** Cada marca REVISAR do corpo, na ordem do texto:
>
> - **Preâmbulo:** o Contrato é formado por quadro-resumo e condições gerais, e o quadro-resumo
>   prevalece na divergência.
> - **Quadro-resumo:** inteiro novo. Início no aceite, ciclo pós-pago, carência, primeira fatura e
>   prazo de suspensão vêm de campos do sistema.
> - **§1, 1º parágrafo:** descrição do produto, tirada da seção 3 dos Termos de Uso do Addere.
> - **§1, 3º parágrafo:** aviso de que o Addere não é produto oficial da TOTVS.
> - **§2, Empresa Contratante:** só pessoa jurídica que usa o ERP; o modelo admitia pessoa física.
> - **§2, Clientes da Empresa Contratante:** substituem o proprietário do cavalo e mantêm o "não são
>   parte".
> - **§2, ERP:** definição nova.
> - **§2, Camada de Inteligência:** definição nova, ligada ao tipo de licença.
> - **§3.1:** pacote com quantidade e valor total; no Ilimitado, a quantidade do quadro-resumo.
> - **§3.2:** vendedor e gerente ocupam licença, administrador não, e desativar libera na hora.
> - **§3.3:** o limite de licenças e o que acontece quando é atingido.
> - **§3.4:** licença adicional avulsa pelo valor unitário.
> - **§3.5:** o pedido de adicionais no painel, com o preço na tela, vale como contratação sem
>   aditivo; liberado após aprovação e cobrado a partir do mês seguinte.
> - **§3.6:** a Camada de Inteligência segue o tipo de licença, e a troca de tipo é por aditivo.
> - **§3.7:** nada vale antes do aceite, e o início é a data do aceite.
> - **§3.9:** cancelamento com efeito no fim do mês do pedido, que é cobrado (no modelo, "fim do
>   ciclo já pago", porque era pré-pago).
> - **§3.10:** forma do pedido de cancelamento: por escrito, ao e-mail de contato.
> - **§4.1:** a justificativa da vedação de senha compartilhada passou a falar de pedidos e visitas.
> - **§5.3:** "serviços lançados" virou "pedidos lançados".
> - **§5.4:** o pedido só é recebido pelo ERP depois de sincronizado, e a Addere não é parte da
>   venda.
> - **§5.5:** direito de regresso sem o Asaas, com os clientes da Empresa no lugar do proprietário.
>   Conferir se ainda faz sentido numa relação entre empresas.
> - **§6.2:** ciclo pós-pago; fatura emitida pela Addere, disponível no painel e paga por fora;
>   cobra o contratado, não o uso.
> - **§6.3:** o mês do aceite não é cobrado, depois corre a carência, e então vem a primeira fatura.
> - **§6.4:** a mudança vale para o limite na hora e entra na cobrança na competência seguinte.
> - **§6.6:** prazo de suspensão do quadro-resumo, nunca antes de 10 dias do aviso; o que o
>   administrador continua vendo; o acesso volta com a baixa.
> - **§6.8:** reajuste por aditivo; o mês do cancelamento é cobrado pelo preço anterior.
> - **§7.1:** o Addere não envia mensagens; a mensagem sugerida abre no WhatsApp do Usuário.
> - **§8.1(a):** a lista dos dados da operação no Addere.
> - **§8.1(b):** sai a remissão ao 4.2 do modelo (um usuário em vários haras); entram o contrato,
>   as faturas, os contatos de cobrança, o representante legal e os registros de aceite.
> - **§8.2:** fornecedores do Addere, da seção 5 da Política de Privacidade.
> - **§8.3:** sai o registro imutável de eventos financeiros, que o Addere não tem.
> - **§8.4:** os dados de clientes vêm do ERP; o Addere não tem a função de exclusão do modelo, e a
>   eliminação no Addere é feita pela Addere a pedido da Empresa.
> - **§8.7:** fornecedores do Addere e onde tratam os dados.
> - **§8.9:** textos da Inteligência escritos por modelo de linguagem com dados pseudonimizados.
> - **§9.1:** acréscimo, às exclusões, do ERP e dos endpoints de integração mantidos pela Empresa.
> - **§9.2:** "serviços" viraram "pedidos", e o pedido não sincronizado não chega ao ERP.
> - **§9.3:** pedidos pendentes podem se perder se o aplicativo for apagado antes de sincronizar.
> - **§9.5:** as sugestões da Inteligência são apoio à decisão.
> - **§9.6:** canais de suporte, sem prazo de atendimento.
> - **§10.5:** manter o ERP com REST e os endpoints de integração.
> - **§10.6:** credenciais de integração e exatidão dos dados do ERP.
> - **§10.7:** base legal para a localização no check-in.
> - **§10.8:** os Usuários conhecem e cumprem os Termos de Uso.
> - **§11.2:** "animal" virou "cliente dela" no que os dados anonimizados não podem identificar.
> - **§11.3:** alcance da licença de uso, da seção 5 dos Termos de Uso.
> - **§12.4:** acesso bloqueado no encerramento; pedidos sincronizados ficam no ERP.
> - **§13, 1º parágrafo:** "termo aditivo assinado" virou "termo aditivo aceito eletronicamente no
>   painel do Addere". O parecer (item 3, cláusula 15) admitiu aditivo assinado ou aceite no
>   sistema.
> - **§13, 2º parágrafo:** o que conta como alteração, e o aditivo sem aumento de valor que vale no
>   aceite, sem os 30 dias.
> - **§14.1:** aceite eletrônico (MP 2.200-2/2001, art. 10, § 2º) e declaração de poderes de quem
>   aceita.
> - **§14.2:** o que o sistema registra no aceite; o texto aceito fica congelado.
> - **§14.3:** o pedido de licenças adicionais é registrado do mesmo modo.
> - **§14.4:** impressão e PDF do documento aceito.
> - **§15:** relação com os Termos de Uso e a Política de Privacidade.
>
> **Também para o advogado, sem marca no texto:**
>
> - **Não há teto de indenização.** No modelo, o crédito do 11.5 era o limite máximo da
>   indenização para quem não é consumidor (11.6). Sem meta de disponibilidade, o 11.5 a 11.7
>   saíram, e esse teto deixou de existir. Criar outro seria cláusula nova.
> - **Quem aceita.** Pela decisão de produto 10, qualquer administrador ativo da Empresa pode
>   aceitar, e ele pode não ser o representante legal do quadro-resumo. O §14.1 faz quem aceita
>   declarar ter poderes para obrigar a Empresa. Isso basta, ou o aceite precisa ser do
>   representante legal (ou de quem tem procuração)?
> - **Bloqueio manual.** O plano 017 deixa o superadmin bloquear à mão (motivo MANUAL). O contrato
>   só prevê suspensão por atraso, com o aviso de 10 dias (§6.5 e §6.6). Ou o bloqueio manual só é
>   usado dentro desse rito, ou entra uma hipótese nova (violação, risco à segurança), que seria
>   cláusula nova.
> - **Os 30 dias do §13 e o "aumenta preço" do plano 014.** O 2º parágrafo do §13 dispensa os 30
>   dias para o aditivo que não aumenta o valor do pacote nem o valor unitário da licença adicional.
>   Um aditivo que só acrescenta licenças, sem mudar o valor unitário, aumenta o total mensal e
>   ainda assim vale no aceite. Também dispensa o aditivo feito a pedido da Empresa (decisão de
>   15/10/2026: o upgrade Padrão → Com Inteligência pedido pelo cliente vale no aceite; o que ele
>   pediu fica escrito no motivo do aditivo que ele aceita). Confirmar o critério e a exceção.
>
> **Promessas do contrato × sistema.** As linhas 1 a 8 são as do plano aprovado; as de 9 em
> diante entraram nesta minuta, porque o texto também promete isso.
>
> | # | O contrato promete | Onde | Quem cumpre |
> |---|---|---|---|
> | 1 | Aviso de suspensão com a data prevista, ≥ 10 dias corridos antes | §6.5, §6.6 | Código, plano 017: só bloqueia com o aviso gravado há ≥ 10 dias |
> | 2 | Suspensão não apaga dados | §6.5 | Código, plano 017: o bloqueio é por rota |
> | 3 | Alteração só depois do aceite; até lá vale a versão anterior | §13 | Código, plano 014 |
> | 4 | Aumento de preço comunicado com ≥ 30 dias | §6.7, §13 | Código, plano 014: o aditivo que aumenta preço exige `proposedEffectiveFrom` ≥ envio + 30 dias |
> | 5 | Cancelamento com efeito no fim do mês, que é cobrado | §3.9 | Código, plano 016 |
> | 6 | Licença adicional cobrada a partir do mês seguinte | §3.5, §6.4 | Código, planos 015 e 016 |
> | 7 | Incidente comunicado em 48 h | §8.6 | Processo, em `docs/billing/README.md` (a escrever) |
> | 8 | Cópia dos dados em 30 + 15 dias e eliminação depois | §12.3 | Processo manual; a automação fica nas pendências |
> | 9 | Nada vale antes do aceite; o mês do aceite não é cobrado; carência; primeira fatura | §3.7, §6.3 | Código, planos 013 (calendário) e 016 |
> | 10 | Fatura pós-paga emitida no início do mês seguinte, com vencimento no dia do quadro-resumo e disponível no painel | §6.2 | Código, plano 016 |
> | 11 | Mudança vale para o limite na hora e para a cobrança na competência seguinte | §6.4 | Código, planos 013 (termos da competência), 015 e 016 |
> | 12 | Vendedor e gerente ocupam licença, administrador não; desativar libera; limite bloqueia nova ativação | §3.2, §3.3 | Código, plano 015 |
> | 13 | Pedido de adicionais no painel, com o preço na tela e registro do aceite; liberação após aprovação | §3.5, §14.3 | Código, plano 015 |
> | 14 | Camada de Inteligência ligada e desligada pelo tipo de licença | §3.6 | Código, plano 014 |
> | 15 | Administrador vê contrato, aditivos e faturas durante a suspensão; acesso volta com a baixa | §6.6 | Código, plano 017 (faturas no plano 016) |
> | 16 | Registro do aceite (usuário, data e hora, IP, navegador, SHA-256), texto congelado, impressão em PDF | §14 | Código, plano 014. O IP real depende do `trustProxy` |
> | 17 | Aditivo sem aumento de valor vale no aceite; com aumento ou nova versão das condições, 30 dias | §13 | Código, plano 014 |
> | 18 | Dados isolados por empresa, criptografados em trânsito e em repouso; credenciais do ERP cifradas | §8.3 | Já existe: HTTPS, banco no Neon cifrado em repouso, `protheus-crypto.ts`. A cópia offline no aparelho (AsyncStorage e SQLite) não tem cifra própria do app e depende da criptografia do sistema operacional: conferir |
> | 19 | Textos da Inteligência com dados pseudonimizados e conferidos antes de chegar ao app | §8.9 | Já existe: `ALLOWED_FACT_KEYS` em `intelligence/agent/facts.ts` e a conferência do agente |
> | 20 | Eliminação, a pedido da Empresa, dos dados de um titular no Addere; registros fiscais mantidos identificados e bloqueados | §8.4, §8.5 | Processo manual; não há função no sistema |

---

## Como ler esta minuta

**Trocas de nome, aplicadas em todo o corpo sem marca:** BaiaCerta → Addere (a empresa é "a
Addere"; o sistema, "o Addere"); haras → Empresa Contratante; proprietário do cavalo → cliente da
Empresa Contratante; usuários do haras → Usuários; papéis gestor e tratador → gerente e vendedor;
estes termos → este Contrato; assinatura → contratação (no §1, licença de uso mensal); plano →
pacote; pacotes adicionais → licenças adicionais; baiacerta.com.br → addere.com.br. A concordância
de gênero e de número acompanha a troca.

**Ajustes mecânicos sem marca:** renumeração das cláusulas e das remissões internas; saída das
menções ao Asaas que dependiam do §5 do modelo ("Não é serviço financeiro — ver o §5", no §1);
"veterinárias" saiu do §9.4 e "dos animais" saiu do §10.1; o encarregado do §8.8 usa o nome e o
canal da seção 12 da Política de Privacidade do Addere ("Gustavo Costa", contato@addere.com.br). É a
mesma pessoa do modelo, que traz o nome completo (Gustavo Henrique Palitot Costa): decidir qual
forma vai no Contrato e na Política.

**Correspondência com a minuta 1.6 do BaiaCerta:**

| Addere v1 | BaiaCerta 1.6 | Como ficou |
|---|---|---|
| Preâmbulo e quadro-resumo | — | Novos, com marca |
| §1 | §1 | 2º parágrafo do modelo com os nomes trocados; 1º e 3º novos, com marca |
| §2 | §2 | Addere e Usuários com os nomes trocados; Empresa Contratante, clientes, ERP e Camada de Inteligência com marca; saem Asaas e "cliente" do §5 |
| §3.1 a §3.7, §3.10 | §3.1, §3.2 | Novos, com marca |
| §3.8 | §3.3 | Nomes trocados |
| §3.9 | §3.4 | Adaptado ao pós-pago, com marca |
| §4.1 | §4.1 | 1ª frase igual; justificativa com marca |
| §4.2, §4.3 | §4.3, §4.4 | Nomes trocados. O 4.2 do modelo sai: no Addere, um usuário pertence a uma empresa |
| — | §5, §6 | Saem (Asaas e conta de recebimento) |
| §5.1, §5.2 | §7.1, §7.2 | Nomes trocados |
| §5.3 | §7.3 | Com marca ("pedidos" no lugar de "serviços") |
| §5.4 | — | Novo, com marca |
| §5.5 | §7.4 | Sem o Asaas, com marca |
| §6.1, §6.5, §6.7 | §8.1, §8.2, §8.3 | Nomes trocados |
| §6.2, §6.3, §6.4, §6.6, §6.8 | — | Novos, com marca (pós-pago, carência, suspensão, reajuste) |
| §7.1 | §9.1 | Substituído, com marca |
| §7.2 | §9.2 | Nomes trocados |
| — | §9.3, §9.4 | Saem: o Addere não envia mensagem automática nem link de fatura |
| §8.1 a §8.8 | §10.1 a §10.8 | Estrutura mantida. Iguais com os nomes trocados: abertura do 8.1, frase do operador em (a), 8.5, 8.6, as duas últimas frases do 8.7 e 8.8. Com marca: (a) lista, (b), 8.2, 8.3, 8.4 e a lista do 8.7; sai o (c) Asaas |
| §8.9 | — | Novo, com marca |
| — | §11.1, §11.5, §11.6, §11.7 | Saem (sem meta de 99,5 % e sem crédito) |
| §9.1 | §11.2 | Igual, com o acréscimo do ERP marcado |
| §9.2 | §11.3 | Com marca |
| §9.3 | — | Novo, com marca |
| §9.4 | §11.4 | Nomes trocados, sem "veterinárias" |
| §9.5, §9.6 | — | Novos, com marca |
| §10.1 a §10.4 | §12.1 a §12.4 | Nomes trocados |
| §10.5 a §10.8 | — | Novos, com marca (seção 8 dos Termos do Addere) |
| §11.1 | §13.1 | Nomes trocados |
| §11.2 | §13.2 | Com marca ("cliente dela" no lugar de "animal") |
| §11.3 | — | Novo, com marca (seção 5 dos Termos do Addere) |
| §12.1 a §12.3 | §14.1 a §14.3 | Nomes trocados |
| §12.4 | — | Novo, com marca. O 14.4 do modelo (Asaas) sai |
| §13 | §15 | 1º parágrafo com a troca do aditivo marcada; 2º novo, com marca |
| §14 | §16 | Baia Monitorada sai; entra Aceite eletrônico, com marca |
| §15 | — | Novo, com marca |
| §16 | §17 | Nomes trocados |

**Notas para o plano 014 (renderização):**

- O corpo não escreve "R$" antes dos campos de valor. `valores.pacote`, `valores.adicional`,
  `valores.mensal` e os `aditivo.valor*Anterior` e `aditivo.mensalAnterior` saem já formatados
  ("R$ 1.500,00"), e os campos `*Extenso` saem em reais ("mil e quinhentos reais").
- `licenca.tipo` sai como "Padrão" ou "Com Inteligência", os nomes que o §3.6 usa.
  `licenca.inteligencia` sai como "Incluída" ou "Não incluída".
- `cobranca.carenciaMeses` sai como número inteiro, e zero é válido (sem carência).
- As remissões internas (§3.5, §6.4, §6.7, §13, §14) são citadas pelo aditivo v1. Renumerar o
  contrato exige uma versão nova do aditivo.

---

<!-- INÍCIO DO TEXTO PUBLICÁVEL -->

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

**3.5** O pedido de licenças adicionais feito no painel do Addere por um administrador da Empresa Contratante, com o preço exibido na tela, vale como contratação dessas licenças, sem termo aditivo. As licenças pedidas são liberadas depois da aprovação da Addere e cobradas a partir do mês seguinte ao da liberação. [[REVISAR: contratação de adicionais por pedido no painel, sem aditivo]]

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

**8.8 Encarregado.** O encarregado pelo tratamento de dados pessoais da Addere é **Gustavo Costa**, que atende titulares, Empresas Contratantes e a Autoridade Nacional de Proteção de Dados pelo canal **contato@addere.com.br**.

**8.9 Camada de Inteligência.** Quando a licença inclui a Camada de Inteligência, os textos de apoio à venda (plano do dia, resumo antes da visita e mensagem sugerida) são escritos por modelo de linguagem a partir de dados comerciais pseudonimizados. Nome, código, CNPJ, CPF, e-mail, CEP e telefone dos clientes da Empresa Contratante não são enviados ao provedor do modelo. Os textos são conferidos antes de chegar ao aplicativo; quando não passam na conferência, o aplicativo mostra o texto montado pelas regras. [[REVISAR: da seção 11 dos Termos de Uso e da seção 3.9 da Política de Privacidade do Addere]]

### 9. Disponibilidade, suporte e limites

**9.1** Não são de responsabilidade da Addere as interrupções decorrentes de falha de internet, de rede ou de energia da própria Empresa Contratante, de dispositivos da Empresa Contratante ou de seus Usuários, do ERP da Empresa Contratante e dos endpoints de integração mantidos por ela (§10.5), [[REVISAR: acréscimo do ERP e dos endpoints de integração mantidos pela Empresa Contratante]] nem as decorrentes de caso fortuito ou força maior (art. 393 do Código Civil).

**9.2** O aplicativo funciona sem internet para registro de pedidos em campo, sincronizando quando a conexão volta. Enquanto não sincronizar, o pedido não aparece para os demais Usuários e não é recebido pelo ERP da Empresa Contratante. [[REVISAR: serviços viraram pedidos, e entra o recebimento pelo ERP]]

**9.3** Se o aplicativo for desinstalado ou os dados do aparelho forem apagados antes da sincronização, os pedidos pendentes podem ser perdidos. [[REVISAR: da seção 10 dos Termos de Uso do Addere]]

**9.4** A Addere não responde por decisões operacionais ou comerciais tomadas com base nas informações do sistema.

**9.5** Na Camada de Inteligência, situações, prioridades e valores esperados são calculados por regras determinísticas a partir dos dados do ERP. As sugestões são apoio à decisão: não garantem venda e não substituem o julgamento do Usuário e da Empresa Contratante. A qualidade das sugestões depende da qualidade dos dados do ERP. [[REVISAR: da seção 11 dos Termos de Uso do Addere]]

**9.6** Os Usuários são atendidos pelo e-mail de suporte do quadro-resumo, {{contratada.emailSuporte}}; os assuntos comerciais e contratuais, pelo e-mail de contato, {{contratada.emailContato}}. [[REVISAR: canais de suporte, da seção 12 dos Termos de Uso do Addere, sem prazo de atendimento]]

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

**14.1** Este Contrato e os seus termos aditivos são aceitos eletronicamente no painel do Addere por um administrador da Empresa Contratante, depois de exibido o texto inteiro e de marcada a concordância. Quem aceita declara ter poderes para obrigar a Empresa Contratante. As partes admitem esse meio de comprovação da autoria e da integridade do documento, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001. [[REVISAR: aceite eletrônico no lugar do contrato assinado do modelo]]

**14.2** No aceite, o sistema registra o Usuário que aceitou, a data e a hora, o endereço IP, a identificação do navegador e o resumo criptográfico (hash SHA-256) do texto aceito. O texto aceito fica congelado: mudanças posteriores no modelo não o alteram. [[REVISAR: o que o sistema registra no aceite]]

**14.3** O pedido de licenças adicionais do §3.5 é registrado do mesmo modo, com o texto exibido na tela no momento do pedido. [[REVISAR: registro do pedido de licenças adicionais]]

**14.4** Durante a vigência deste Contrato, a Empresa Contratante pode imprimir ou salvar em PDF, pelo painel do Addere, este Contrato e os termos aditivos aceitos, com os dados do aceite. [[REVISAR: cópia do documento aceito]]

### 15. Relação com os Termos de Uso e a Política de Privacidade

Os Termos de Uso e a Política de Privacidade do Addere, publicados em addere.com.br, valem para os Usuários. Para a Empresa Contratante, este Contrato prevalece sobre eles naquilo em que forem diferentes. [[REVISAR: hierarquia entre o Contrato e os documentos públicos]]

### 16. Lei aplicável e foro

Aplica-se a lei brasileira. Fica eleito o foro da comarca de **João Pessoa, Paraíba** — sede da Addere —, com renúncia a qualquer outro, ressalvada a hipótese de contratante consumidor, caso em que prevalece o foro legalmente assegurado a ele.

<!-- FIM DO TEXTO PUBLICÁVEL -->

---

## Histórico de versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0-minuta | 15/10/2026 | **Adaptado da minuta 1.6 dos Termos do BaiaCerta (revisão jurídica de 04/10/2026)** para o Addere, com as regras comerciais de 15/10/2026. **Saiu:** o Asaas (§5, §6, 10.1(c), segundo parágrafo do 10.2, 14.4 e a menção do §1), a conta de recebimento, o proprietário do cavalo (fica só adaptado no direito de regresso), o 4.2 (um usuário em vários haras), o 9.3 e o 9.4 (envio automático e link de fatura), a meta de 99,5 % e o crédito (11.1, 11.5, 11.6 e 11.7) e a Baia Monitorada (§16). **Entrou, com marca REVISAR:** preâmbulo e quadro-resumo; a contratação por pacote de licenças, com adicionais, pedido no painel, tipo de licença e início no aceite (§3); o ciclo pós-pago, a carência, a mudança cobrada na competência seguinte e o rito da suspensão (§6.2 a §6.4, §6.6 e §6.8); pedidos e sincronização com o ERP (§5.4, §9.2 e §9.3); mensagens pelo WhatsApp do Usuário (§7.1); a repartição de papéis da LGPD e os fornecedores do Addere (§8.1, §8.2, §8.4 e §8.7); a Camada de Inteligência (§8.9 e §9.5); suporte (§9.6); obrigações de ERP (§10.5 a §10.8); alcance da licença (§11.3); efeitos do encerramento (§12.4); o aditivo aceito no painel (§13); o aceite eletrônico (§14); e a relação com os Termos e a Política (§15). **Ficou palavra por palavra, só com os nomes trocados:** o 2º parágrafo do 1, 2 (Addere e Usuários), 3.8, 4.2, 4.3, 5.1, 5.2, 6.1, 6.5 (o 8.2 do modelo), 6.7 (o 8.3), 7.2, a abertura do 8.1 e a frase do operador em 8.1(a), 8.5, 8.6, as duas últimas frases do 8.7, 8.8, 9.1 (menos o acréscimo do ERP), 9.4 (sem "veterinárias"), 10.1 (sem "dos animais") a 10.4, 11.1, 12.1 a 12.3, o 1º parágrafo do 13 (menos a troca do aditivo) e 16 (foro). **Pendente de revisão jurídica.** |
