# Termo Aditivo ao Contrato de Licença de Uso do Addere — modelo v1

**Versão:** 1.0-minuta
**Data:** 15/10/2026
**Origem:** redação nova. O modelo revisado do BaiaCerta (minuta 1.6) não tem aditivo; este texto
segue o §13 (alterações) e o §14 (aceite eletrônico) de `docs/billing/contrato-licenca-de-uso-v1.md`.
**Partes:** GH ENGENHARIA LTDA - ME (Addere) e a Empresa Contratante.
**Aceite:** eletrônico, no painel do Addere, por um administrador da Empresa Contratante, com o mesmo
registro do contrato.
**No sistema:** o plano 014 grava como versão 1 do `ContractTemplate` de tipo AMENDMENT, em DRAFT,
só o trecho entre os dois comentários de marcação (início e fim do texto publicável).

---

> ## ⚠️ MINUTA — AINDA NÃO PUBLICAR
>
> Este aviso, as notas e o histórico de versões **não fazem parte do texto publicado**. Nada do
> corpo vem do modelo revisado, então cada cláusula leva uma marca REVISAR, e o sistema não publica
> o modelo enquanto houver uma.
>
> **Bloqueia a publicação:**
>
> 1. **Depende do contrato v1.** O aditivo cita o §6.4, o §6.7, o §13 e o §14 do contrato v1. Só
>    publicar junto com ele, depois de o advogado validar os dois e de resolvidos os itens que
>    bloqueiam o contrato. Renumerar o contrato exige uma versão nova deste aditivo.
> 2. **Nova versão das condições gerais.** Pelo plano aprovado, para levar um cliente a uma versão
>    nova das condições gerais envia-se um aditivo "que carrega o texto novo". Este modelo não tem
>    como carregar esse texto: a lista fechada de campos não tem um para isso. Ele serve para
>    troca de pacote, de tipo e de valores. O plano 014 precisa decidir o mecanismo (anexar o corpo
>    novo ao documento? campo novo?) antes de usar aditivo para trocar de versão.
>
> **Para o advogado validar.** Cada marca REVISAR do corpo, na ordem do texto:
>
> - **Partes:** qualificação das partes pelos campos do cadastro.
> - **§1.1:** identificação do Contrato pela data do aceite original e remissão ao §13.
> - **§1.2:** motivo da alteração, em texto livre do superadmin.
> - **§2:** quadro "antes" e "depois".
> - **§3.1:** as condições novas valem na data indicada ou no aceite, o que for posterior; até lá,
>   valem as anteriores.
> - **§3.2:** as condições novas valem para o limite de licenças e a Inteligência na hora, e para
>   a cobrança a partir da competência seguinte.
> - **§3.3:** se o aditivo aumentar valor, a Empresa pode cancelar sem ônus antes de ele valer
>   (como o 8.3 e o 15 do modelo do BaiaCerta).
> - **§4.1:** as demais cláusulas do Contrato ficam como estão.
> - **§4.2:** aceite eletrônico nos mesmos termos do §14 do Contrato.
>
> **Promessas do aditivo × sistema:**
>
> | O aditivo promete | Onde | Quem cumpre |
> |---|---|---|
> | Até o aceite valem as condições anteriores | §3.1 | Código, plano 014: os termos novos ficam PROPOSED até o aceite |
> | Vale no maior entre a data indicada e o aceite | §3.1 | Código, plano 014: `effectiveFrom` = maior entre o aceite e `proposedEffectiveFrom` |
> | Aumento de valor só vale depois de ≥ 30 dias do envio | §3.3 e §13 do Contrato | Código, plano 014: `proposedEffectiveFrom` ≥ envio + 30 dias |
> | Limite e Inteligência mudam na hora; cobrança na competência seguinte | §3.2 | Código, planos 013 (termos da competência), 014, 015 e 016 |
> | Cancelar sem ônus antes do aumento; mês do cancelamento cobrado pelo preço anterior | §3.3 | Código, plano 016 |
> | Registro do aceite e texto congelado | §4.2 | Código, plano 014 |

---

## Notas para o plano 014 (renderização)

- `aditivo.valeAPartirDe` precisa sair sempre preenchido, porque campo sem dado impede o envio.
  Quando o superadmin não informar a data, o campo recebe a data de emissão, e o "o que for
  posterior" do §3.1 resolve para a data do aceite.
- `aditivo.contratoAceitoEm` é a data do aceite do contrato original, não a do último aditivo.
- Os campos de valor (`valores.*` e `aditivo.valor*Anterior`, `aditivo.mensalAnterior`) saem
  formatados com "R$", e os `*Extenso` saem em reais, como no contrato.
- O quadro "antes" não tem a Camada de Inteligência nem o total de licenças, porque a lista de
  campos não tem `aditivo.*` para eles: o tipo anterior já diz se a Inteligência estava incluída.
- Dia de vencimento, carência e dias para suspensão não fazem parte dos termos do aditivo
  (`ContractTerms`) e não aparecem aqui.

---

<!-- INÍCIO DO TEXTO PUBLICÁVEL -->

# TERMO ADITIVO AO CONTRATO DE LICENÇA DE USO DO ADDERE

## PARTES

- **Contratada:** {{contratada.razaoSocial}}, CNPJ {{contratada.cnpj}}, com sede em {{contratada.endereco}}, doravante Addere.
- **Empresa Contratante:** {{cliente.razaoSocial}} ({{cliente.nomeFantasia}}), CNPJ {{cliente.cnpj}}, com sede em {{cliente.endereco}}, representada por {{cliente.representanteNome}}, CPF {{cliente.representanteCpf}}, {{cliente.representanteCargo}}.

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

<!-- FIM DO TEXTO PUBLICÁVEL -->

---

## Histórico de versões

| Versão | Data | Mudança |
|---|---|---|
| 1.0-minuta | 15/10/2026 | Redação inicial, para acompanhar o contrato v1 (adaptado da minuta 1.6 dos Termos do BaiaCerta, revisão jurídica de 04/10/2026). O modelo revisado não tem aditivo, então **nada aqui ficou palavra por palavra** e todo o corpo leva marca REVISAR. Traz as partes, o Contrato alterado com a data do aceite original e o motivo, o quadro "antes" e "depois", a data em que as condições novas valem (a indicada ou o aceite, o que for posterior), a cobrança a partir da competência seguinte, o cancelamento sem ônus antes de um aumento (como o 8.3 e o 15 do modelo), a manutenção das demais cláusulas e o aceite eletrônico nos termos do §14 do Contrato. **Pendente de revisão jurídica.** |
