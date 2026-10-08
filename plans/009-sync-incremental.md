# Plano 009: Sincronizar só o que mudou no Protheus (marca d'água por `S_T_A_M_P_`)

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 3465d00..HEAD -- apps/api/src/modules/intelligence/sync apps/api/src/modules/intelligence/protheus-sql apps/api/src/modules/intelligence/engine/engine.service.ts apps/api/src/modules/intelligence/jobs packages/db/prisma/schema.prisma`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: L
- **Risco**: MED — muda como os dados do ERP entram no Addere; com erro, o motor
  trabalha sobre dados velhos sem avisar ninguém
- **Depende de**: nenhum plano. Depende de **pré-requisito de ambiente**: a
  coluna `S_T_A_M_P_` habilitada no banco de cada cliente (ver abaixo)
- **Categoria**: performance + bug
- **Planejado em**: commit `3465d00`, 2026-10-08
- **Atenção**: tem migration (tabela nova de cursores). Migration escrita à mão,
  como no 006 — o banco do Render não é acessível localmente.

## Por que isso importa

Hoje a sincronização relê do Protheus volumes que não mudaram, e por isso não dá
para rodá-la muitas vezes por dia em empresa grande:

| Contrato | Como persiste hoje | Quando roda |
|---|---|---|
| `OPEN_TITLES` (SE1) | **Apaga todos os títulos da empresa** e regrava | refresh (padrão a cada 4h) + noturno |
| `SALES` (SD2/SF2) | Apaga e regrava a **janela dos últimos 7 dias** | refresh + noturno |
| `CUSTOMERS` (SA1, enriquecimento) | Relê a carteira inteira | noturno |
| `PRODUCTS` (SB1, enriquecimento) | Relê o cadastro inteiro | domingo |

Três problemas, nessa ordem de gravidade:

1. **Custo.** O `OPEN_TITLES` regrava a carteira de títulos inteira ~6 vezes por
   dia. Numa empresa com dezenas de milhares de títulos em aberto, é o que
   inviabiliza encurtar o intervalo.
2. **Correção.** A janela de 7 dias de `SALES` faz o **contrário** do excesso:
   cancelamento ou devolução de nota com mais de 7 dias **nunca chega**. O
   Addere fica com venda que o Protheus já desfez.
3. **Bug ativo, independente do resto.** `OpenTitle.daysOverdue` vem **só** da
   coluna opcional `dias_atraso` da consulta. A consulta de referência da SE1
   (`contracts.ts`) **não traz essa coluna**. Resultado: com a consulta de
   referência, `daysOverdue` é `null`, `checkBlocked` lê `null ?? 0` e o
   **bloqueio por título vencido nunca dispara**. E mesmo quando a consulta
   traz `dias_atraso`, o valor é congelado no momento do sync — com sync
   incremental ele ficaria congelado para sempre num título que não muda.

**Decisão do Gustavo (08/10/2026)**: o cliente aceita habilitar o
`S_T_A_M_P_`, e nas tabelas que ainda não tiverem a coluna ela será incluída.

## Pré-requisito de ambiente (já verificado no cliente piloto)

Conferido pelo Gustavo em 08/10/2026, tabela por tabela, no SQL Server do cliente
(`CHFJP01TVS003`, base `TOTVS`), com `SELECT TOP 10 * FROM <tabela> WHERE
S_T_A_M_P_ > '2026-10-01'`:

| Tabela | Resultado |
|---|---|
| SE1010 | coluna existe e é preenchida |
| SD2010 | existe e é preenchida; **linha excluída (`D_E_L_E_T_='*'`, `R_E_C_D_E_L_` preenchido) também recebe carimbo novo** — é isso que permite propagar exclusão. Tem também `I_N_S_D_T_` |
| SA1010 | existe e é preenchida |
| SB1010 | existe (consulta rodou sem erro de coluna); 0 linhas alteradas no período |
| SF2010 | existe e é preenchida; nota excluída (`D_E_L_E_T_='*'`, `R_E_C_D_E_L_=41009`) carimbada às 11:59:44, segundos depois do item excluído da SD2 (`R_E_C_N_O_=88131`, 11:59:35) — o cancelamento chega pelas duas tabelas |

O `S_T_A_M_P_` é `datetime` do servidor do banco, **sem fuso**. Este plano o
trata como valor opaco e ordenável: o Addere nunca compara com o próprio relógio.

## Estado atual

- `apps/api/src/modules/intelligence/sync/contract-sync.service.ts`
  - `mapOpenTitleRows` (~linha 97): lê `dias_atraso` opcional para
    `daysOverdue`; sem a coluna, grava `null`.
  - `fetchContractRows` (~129-150): monta placeholders
    (`buildPlaceholderValues` + `substitutePlaceholders`) e chama o adapter.
  - `persistSales` (~154-176): `deleteMany` da janela de datas + `createMany`.
  - `persistOpenTitles` (~178-191): `deleteMany` de **todos** os títulos da
    empresa + `createMany`.
  - `syncContract` (~258-286): janela padrão `incrementalWindow(7)`.
- `apps/api/src/modules/intelligence/protheus-sql/contracts.ts`
  - `SALES` (~94-150): `incrementalWindowDays: 7`, placeholders obrigatórios
    `FILIAL, DATA_INI, DATA_FIM`; SQL de referência filtra
    `D2.D_E_L_E_T_=' '` e `F2.D_E_L_E_T_=' '` (descarta exclusões).
  - `OPEN_TITLES` (~153-190): SQL de referência filtra `E1_SALDO > 0` e
    `D_E_L_E_T_=' '`, **sem `dias_atraso`**.
- `apps/api/src/modules/intelligence/protheus-sql/placeholders.ts`: placeholders
  conhecidos `FILIAL | DATA_INI | DATA_FIM | HOJE | VENDEDOR | PRODUTO`, datas
  validadas por `/^\d{8}$/`. Regra de segurança no topo do arquivo: só valores
  gerados pelo Addere entram no SQL, com regex estrita + escape.
- `apps/api/src/modules/intelligence/protheus-sql/sql-api.adapter.ts`: a API do
  consultor devolve `columns[{name, type: 'C'|'N'}]` — **não há tipo data/hora**.
  `MockSqlAdapter` (~234) gera dataset sintético e ignora o SQL.
- `apps/api/src/modules/intelligence/engine/engine.service.ts`: carrega títulos
  com `select { …, daysOverdue }` (~257) e repassa `daysOverdue` ao motor (~299).
- `apps/api/src/modules/intelligence/engine/signals.ts` `checkBlocked` (~97-115):
  bloqueia se `max(daysOverdue ?? 0) > blocked_days`.
- `apps/api/src/modules/intelligence/app/customers.routes.ts` (~71-90): a Ficha
  do app também mostra `maxDaysOverdue` a partir de `daysOverdue`.
- `apps/api/src/modules/intelligence/jobs/nightly.ts` (~46-50): roda `DAILY` +
  `REFRESH` (+ `WEEKLY` aos domingos). `jobs/refresh.ts`: só contratos
  `REFRESH`.
- `packages/db/prisma/schema.prisma`: `SalesItem` com
  `@@id([companyId, orderRef, itemSeq, productCode])`; `OpenTitle` com
  `@@id([companyId, titleRef])`, `dueDate` e `daysOverdue Int?`.

## Decisões de desenho que este plano toma

1. **Incremental é opt-in pela consulta.** Uma consulta vira incremental quando
   usa o placeholder novo `{{DESDE}}`. Consulta sem `{{DESDE}}` continua
   exatamente como hoje. Empresa sem `S_T_A_M_P_` não quebra.
2. **A marca d'água vem do Protheus.** O cursor é o **maior `stamp` recebido**,
   não o relógio do Addere. Na próxima leitura, `{{DESDE}}` = cursor **menos 10
   minutos** de folga — cobre transação longa que gravou carimbo antigo e
   comitou depois da leitura. Reler algumas linhas é inofensivo porque a
   gravação passa a ser por chave (upsert).
3. **O `stamp` viaja como texto.** A API do consultor só tipa `C`/`N`, então a
   consulta devolve `CONVERT(VARCHAR(23), X.S_T_A_M_P_, 121) AS stamp`
   (`AAAA-MM-DD hh:mm:ss.mmm`, ordenável lexicograficamente). `{{DESDE}}` é
   substituído no mesmo formato, validado por regex estrita.
4. **Exclusão propaga.** Em modo incremental a consulta **não** filtra
   `D_E_L_E_T_` e devolve a coluna `excluido` (`'*'` ou `' '`). Linha com
   `excluido='*'` → o Addere apaga pela chave. Para título, saldo `<= 0` também
   apaga (é a baixa).
5. **Dias de atraso são calculados no Addere**, a partir de `dueDate` e da data
   de hoje em São Paulo, na hora de ler — nunca congelados no sync. A coluna
   `dias_atraso` da consulta passa a ser ignorada (e `daysOverdue` deixa de ser
   lida).
6. **Rede de segurança semanal.** Domingo, no noturno, os contratos
   incrementais rodam em **modo completo** (cursor ignorado, persistência por
   substituição como hoje) e o cursor é reposto ao final. Pega o que o carimbo
   não vê (alteração feita direto no banco, fora do DBAccess).
   Para `SALES` o modo completo é uma janela de **35 dias** com substituição —
   não os 13 meses do backfill.
7. **Publicar nova versão da consulta zera o cursor.** SQL novo pode trazer
   linhas que o antigo filtrava; a primeira execução depois de publicar é
   completa.

## Quem acessa

Nada muda em permissões. Rotas e telas existentes; a única superfície nova no
painel é texto (ajuda de placeholder e o estado do cursor na tela de Saúde).

## Comandos que você vai precisar

```bash
npm run type-check                       # raiz
npm test -w @addere/api                  # Vitest da API
npm run lint
cd packages/db && npx prisma validate
cd packages/db && npx prisma migrate diff --from-schema-datamodel <schema-anterior> --to-schema-datamodel ./prisma/schema.prisma --script
npm run intel:smoke -w @addere/api       # com INTEL_SQL_ADAPTER=mock INTEL_GEOCODER=mock
```

## Escopo

**Entra:**
- `packages/db/prisma/schema.prisma` + migration nova (`IntelSyncCursor`)
- `apps/api/src/modules/intelligence/protheus-sql/placeholders.ts`,
  `placeholder-values.ts`, `contracts.ts`, `mock-dataset.ts`
- `apps/api/src/modules/intelligence/sync/contract-sync.service.ts` (+ testes)
- `apps/api/src/modules/intelligence/jobs/nightly.ts`, `refresh.ts`
- `apps/api/src/modules/intelligence/engine/engine.service.ts` e
  `app/customers.routes.ts` — **só** a troca de `daysOverdue` por cálculo a
  partir de `dueDate`
- `apps/api/src/modules/intelligence/admin/queries.service.ts` — zerar cursor
  ao publicar
- `apps/web` — só textos (ajuda do `{{DESDE}}` na tela de Consultas; cursor na
  Saúde)

**Não entra:**
- Recalcular status dos clientes depois do refresh (fica para o plano 010 —
  ver "Notas de manutenção").
- Sync REST de clientes/produtos (`modules/sync/`): já aceita `INTERV`; ajustar
  é configuração por empresa, não código.
- `STOCK` (consulta na hora, sem persistência).
- `apps/mobile`.

## Fluxo de git

Branch a partir de `origin/staging`, PR para `staging` (nunca empilhado — ver o
incidente do #171 no README). Um commit por passo, mensagem em português.

## Passos

### Passo 1: Dias de atraso calculados a partir do vencimento (bug, entrega sozinho)

- Função pura `daysOverdueOn(dueDate: Date, todayYmd: string): number` (0 quando
  não venceu), com teste: vence hoje = 0, venceu ontem = 1, virada de mês e de
  ano, fevereiro bissexto.
- `engine.service.ts` e `app/customers.routes.ts`: selecionar `dueDate` em vez
  de `daysOverdue` e calcular com `todayInSaoPaulo`/equivalente já usado no
  motor (não criar outro helper de data BRT se já existir um).
- `mapOpenTitleRows`: parar de ler `dias_atraso` (manter a coluna aceita no
  contrato, para não quebrar consulta publicada, mas ignorada). A coluna
  `daysOverdue` do schema fica — remover é migration sem ganho; marcar como
  obsoleta em comentário.
- Teste de regressão: título com `dueDate` 10 dias atrás e consulta **sem**
  `dias_atraso` → cliente `BLOCKED` com `blocked_days = 5`.

**Verificação:** testes da API passando; o teste de regressão falha no código
anterior (rode-o antes da troca para confirmar).

### Passo 2: Placeholder `{{DESDE}}` e cursor

- `IntelSyncCursor { companyId, name IntelQueryName, stamp String, updatedAt,
  lastFullAt DateTime? }`, `@@id([companyId, name])`, `@@map("intel_sync_cursors")`.
  Migration à mão (`prisma migrate diff`), revisar o SQL gerado.
- `placeholders.ts`: `DESDE` em `KNOWN_PLACEHOLDERS`, validado por
  `/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/`, substituído com aspas pelo
  mesmo `quoteCode`. Valor para modo completo: `'1900-01-01 00:00:00.000'`.
- Helper puro `cursorWithOverlap(stamp, minutes)` — aritmética **sem fuso**
  (parse manual dos campos, não `new Date(string)`, que aplicaria fuso do
  processo). Testes: virada de hora, de dia e de ano.
- Contratos: colunas opcionais `stamp` e `excluido` em `SALES`, `OPEN_TITLES`,
  `CUSTOMERS`, `PRODUCTS`; `DESDE` em `optionalPlaceholders`.

**Verificação:** `npx prisma validate`; testes de placeholder (valor válido,
inválido, ausente quando a consulta usa `{{DESDE}}`).

### Passo 3: `OPEN_TITLES` incremental

- `syncContract` decide o modo: incremental se a consulta publicada contém
  `{{DESDE}}` **e** existe cursor **e** não é execução completa; senão completo.
- Persistência incremental: em transação, `delete` por chave para linhas com
  `excluido='*'` ou saldo `<= 0`; `upsert` por `[companyId, titleRef]` para as
  demais. Usar `upsert-chunked` se o volume pedir — ele já existe em
  `modules/sync/`.
- Persistência completa: igual a hoje (replace total).
- Ao final, gravar cursor = maior `stamp` recebido (se nenhuma linha veio,
  **não** mexer no cursor). Se alguma linha vier sem `stamp`, falhar o passo
  com mensagem clara — consulta com `{{DESDE}}` sem a coluna `stamp` é erro de
  configuração.
- SQL de referência novo (no `referenceSql`, como segunda opção "incremental"):

```sql
SELECT E1_PREFIXO+E1_NUM+E1_PARCELA+E1_TIPO AS titulo, E1_CLIENTE AS cliente_cod,
       E1_LOJA AS cliente_loja, E1_VENCREA AS vencimento, E1_SALDO AS valor_saldo,
       D_E_L_E_T_ AS excluido, CONVERT(VARCHAR(23), S_T_A_M_P_, 121) AS stamp
FROM SE1010
WHERE E1_FILIAL IN ({{FILIAL}}) AND E1_TIPO NOT IN ('NCC','RA','AB-','PA')
  AND S_T_A_M_P_ > {{DESDE}}
ORDER BY S_T_A_M_P_
```

  Atenção à chave: a referência atual usa só `E1_NUM AS titulo`, que **colide**
  entre parcelas e prefixos. A incremental usa a chave completa. Ao publicar a
  versão nova, o cursor zera (decisão 7) e a primeira execução substitui tudo —
  sem mistura de chaves.
- Testes: baixa (saldo 0) remove; exclusão remove; alteração de vencimento
  atualiza; reler a mesma linha (sobreposição) não duplica; lote vazio não move
  o cursor.

**Verificação:** testes; `intel:smoke` com mock continua verde (o mock não usa
`{{DESDE}}`, então roda em modo completo — confirma que nada regrediu).

### Passo 4: `SALES` incremental

- SF2 com `S_T_A_M_P_` já conferida (ver Pré-requisito). Cancelamento de nota
  carimba SF2 e SD2; filtrar pelas duas cobre também alteração só no cabeçalho
  (ex.: troca de `F2_VEND1`), que não toca os itens.
- Referência incremental: mesma de hoje, trocando os filtros de exclusão por
  `D2.D_E_L_E_T_ AS excluido`, `JOIN SF2` **sem** filtro de `D_E_L_E_T_`, e
  `WHERE (D2.S_T_A_M_P_ > {{DESDE}} OR F2.S_T_A_M_P_ > {{DESDE}})`, `stamp` =
  maior dos dois carimbos.
- Persistência incremental: delete por chave (`orderRef, itemSeq,
  productCode`) para `excluido='*'`, upsert para o resto. Modo completo: replace
  da janela de 35 dias (decisão 6).
- Testes: cancelamento de nota com 20 dias de idade remove os itens (hoje não
  removeria — é o teste que prova o ganho); devolução idem.

### Passo 5: `CUSTOMERS` e `PRODUCTS` incrementais

- Mesmo padrão de enriquecimento (só `updateMany` por chave); exclusão aqui
  **não** apaga cliente (soft delete é regra do projeto) — só ignora.

### Passo 6: Agenda e rede de segurança

- `refresh.ts`: contratos incrementais rodam em modo incremental.
- `nightly.ts`: dias úteis → incremental; **domingo → completo** para todos os
  contratos com `{{DESDE}}`, atualizando `lastFullAt`.
- `queries.service.ts`: ao publicar versão nova de um contrato, apagar o cursor
  dele.
- Saúde (`health.service.ts` + tela): por contrato, modo (incremental/completo),
  `stamp` do cursor e `lastFullAt`. Só leitura, admin.

### Passo 7: Ajuda no painel

- Tela de Consultas: `{{DESDE}}` na lista de placeholders opcionais, com uma
  frase: "Use para sincronizar só o que mudou. Exige as colunas `stamp` e
  `excluido` — veja a consulta de referência incremental."

## Plano de testes

Unitários (Vitest, sem banco): `daysOverdueOn`, `cursorWithOverlap`,
substituição de `{{DESDE}}`, decisão de modo, persistência incremental com
`prisma-mock` (baixa, exclusão, sobreposição, lote vazio, linha sem `stamp`).
Integração: `intel:smoke` com mock.

**Medição real (depois do merge na staging, com o Gustavo):** publicar a versão
incremental do `OPEN_TITLES` na empresa piloto, rodar o refresh duas vezes e
anotar `rows` e `ms` de cada execução no metadata do job (a tela de Saúde já
mostra). A segunda deve trazer só as alterações do intervalo.

## Critérios de conclusão

- `type-check`, `lint` e testes da API e do web com exit 0.
- Teste de regressão do Passo 1 (bloqueio por título vencido sem `dias_atraso`)
  passando — e comprovadamente falhando no código anterior.
- Teste de cancelamento de nota antiga (Passo 4) passando.
- Consulta **sem** `{{DESDE}}` se comporta exatamente como antes (testes
  existentes intocados e verdes).
- Migration revisada à mão; nenhum comando de banco executado contra a staging.

## Condições de PARADA

- A API SQL do consultor recusar `CONVERT`, `ORDER BY S_T_A_M_P_` ou a leitura
  de `D_E_L_E_T_`/`S_T_A_M_P_` (o `sql-guard` local ou o `WSQ002` remoto).
- `S_T_A_M_P_` voltar em formato diferente de `AAAA-MM-DD hh:mm:ss.mmm` depois
  do `CONVERT(…, 121)`.
- Qualquer necessidade de mexer em `modules/sync/` (REST) ou em `apps/mobile`.
- Teste existente precisar de asserção alterada para passar.
- Volume do modo completo de `SALES` (35 dias) estourar o `SYNC_TIMEOUT_MS` na
  medição real — reportar antes de aumentar timeout.

## Notas de manutenção

- **Próximo plano (010)**: com o sync incremental, cada execução sabe **quais
  clientes mudaram** (títulos e vendas recebidos). Recalcular o
  `CustomerSignal` só desses clientes logo depois do refresh faz o desbloqueio
  aparecer em horas, não na madrugada — sem refazer o plano do dia. Exige
  separar o cálculo de sinais do `runEngine`, que hoje faz sinais e plano juntos.
- **Cliente bloqueado no cadastro (`A1_MSBLQL`)**: hoje o sync REST marca
  `active=false` e o motor só lê ativos, então o status `BLOCKED` por cadastro
  nunca aparece — o cliente some. Pendente de decisão de produto (aparecer como
  Bloqueado ou sumir). Fora deste plano.
- O `INTERV` do sync REST de clientes/produtos já é incremental do lado do
  Protheus; vale configurar por empresa um valor um pouco maior que o intervalo
  do auto-sync.
- Consulta com `{{DESDE}}` precisa de **índice** em `S_T_A_M_P_` nas tabelas
  grandes (SE1, SD2) para não virar varredura completa no SQL Server. Confirmar
  com o DBA do cliente na medição real.
