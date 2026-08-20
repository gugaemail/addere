# Addere · Inteligência comercial e roteirização — Documento de arquitetura

**Versão** 0.1 · 19/08/2026 · autor: Gustavo (com apoio do Claude)
**Escopo** camada de agentes + motor de sinais + roteirização no app Addere (RN/Expo) e no painel web (Next.js), com dados do Protheus via API de SELECT.
**Uso** fonte única para o Claude Code implementar. Cada seção termina com "Decisões fechadas" e "Em aberto".

Arquivos complementares: `addere-inteligencia-wireframes.html` (app) · `addere-painel-web-wireframes.html` (painel) · skill `Esteira` (referência de regras e moldes de follow-up).

---

## 0. Resumo executivo

O Addere passa a dizer ao vendedor **em quem falar hoje, por quê e o que oferecer**, e ao gerente **onde a equipe está perdendo e se o plano converte**. Três camadas:

1. **Catálogo de consultas** — o Addere define contratos (perguntas com colunas fixas); cada empresa preenche o SELECT que responde no Protheus dela. O agente nunca vê SQL.
2. **Motor de sinais** — determinístico (SQL/TypeScript): ciclo de recompra, status, RFM, mix, bloqueio, gap de meta, score multi-objetivo, seleção com diversidade, agrupamento geográfico.
3. **Agente (LLM)** — prioriza, explica o porquê, escreve texto. Não calcula, não inventa cliente/valor/data. Roda por job noturno (1 chamada por vendedor/dia) + on-demand com cache.

Roteirização entra **como consequência do ranking** (fase 1 agrupa por cidade/bairro, fase 2 ordena por distância, fase 3 fecha com check-in e positivação), nunca como roteirizador de logística.

Diferenciação vs concorrentes (Mercos, MáximaTech, 4Sales, PowerGO, Sellentt): número explicável e reconciliado, onboarding em dias, preço transparente, cadeia ciclo → prioridade → rota → positivação medida, feedback loop.

---

## 1. Princípios (não negociáveis)

Herdados da Esteira e adaptados:

1. **Nunca inventar** cliente, valor, probabilidade, data ou prazo. Tudo vem do motor. Falta dado → o app diz que falta.
2. **O app sugere, o vendedor decide e vende.** WhatsApp-first para contato.
3. **Português simples, sem jargão.** "cliente sumiu", não "churn".
4. **Foco antes de lista.** Um cliente na home, sete no plano, agrupamento na carteira. Nunca 140 com pinos.
5. **Sempre o porquê da ordem.** Nome nunca aparece sem status + fato + número.
6. **Honestidade na previsão.** "deve entrar perto de X se nada mudar", nunca "vai faturar X".
7. **Confiança explícita.** "confiança alta (14 pedidos)" / "sem ciclo confiável (2 pedidos)".
8. **Zero perguntas por padrão.** Só pergunta quando a resposta muda o plano.
9. **Editar é sinal, não erro.** Arrastar/pular/remover é permitido, rápido e gravado.
10. **Offline de verdade.** Plano gerado de madrugada, sincronizado, funciona sem sinal inclusive check-in. Frescor sempre visível.
11. **Bloqueado aparece, mas não vende.**
12. **Sem vigilância.** GPS só no check-in; sem ranking de vendedores por faturamento em destaque.
13. **O LLM não calcula.** Toda soma, média, mediana, percentual é do motor.

---

## 2. Arquitetura geral

```
Protheus (SQL Server/Oracle)
   │  API REST "qualquer SELECT" + API fixa de meta
   ▼
[Sync worker]  (Fastify job · noturno + 4/4h · por tenant, todos os vendedores)
   │  substitui {{PLACEHOLDERS}} · valida · upsert
   ▼
Neon Postgres — camada analítica (crm_*) ──► [Motor de sinais] (SQL + TS, determinístico)
                                                  │  crm_sinal_cliente · crm_plano(_item)
                                                  ▼
                                            [Agente] (Anthropic API, Sonnet)
                                                  │  fatos JSON pseudonimizados → texto
                                                  ▼
                                            crm_plano.resumo_llm · crm_mensagem
   ┌──────────────────────────────────────────────┴──────────────┐
   ▼                                                             ▼
App RN/Expo (offline-first, baixa o plano no sync)        Painel Next.js (admin/gerente)
```

**Decisões fechadas**
- Consultas rodam por **tenant, todos os vendedores**, período largo; filtro de vendedor é feito no Addere a partir do JWT. `{{VENDEDOR}}` existe mas é opcional (on-demand/empresas grandes).
- Protheus nunca é consultado na hora do botão. Só `estoque` (e futuramente limite de crédito) é ao vivo.
- Agente roda por job (madrugada) + on-demand com cache de 4h. Pseudonimização: `CLI_001` no prompt, nome remontado na saída.
- Modelo: Sonnet (tarefa de priorizar/redigir sobre fatos prontos).

**Em aberto**
- Empresa piloto e se ela usa SD2/SF2 ou SC5/SC6.
- Fila de jobs: BullMQ/Redis ou cron simples no Render (MVP pode ser cron).

---

## 3. Catálogo de consultas (contratos)

### 3.1 Placeholders

| Placeholder | Substituído por | Formato |
|---|---|---|
| `{{FILIAL}}` | filial(is) do tenant | `'01'` ou `'01','02'` (já quotado) |
| `{{DATA_INI}}` `{{DATA_FIM}}` | janela | `'YYYYMMDD'` |
| `{{HOJE}}` | data atual | `'YYYYMMDD'` |
| `{{VENDEDOR}}` | vendedor do JWT (opcional) | `'000012'` |
| `{{PRODUTO}}` | só em `estoque` | `'ARZ5K'` |

Substituição por string **só** com valores gerados pelo Addere. Nunca concatenar input de usuário.

### 3.2 Validação no cadastro (bloqueia publicação se falhar)

- Só `SELECT`; sem `;`; sem DDL/DML/EXEC/INTO; sem comentário de bloco aberto.
- Colunas obrigatórias do contrato presentes (via prévia).
- Placeholders coerentes com escopo (`todos` não pode ter `{{VENDEDOR}}`; `por_vendedor` precisa).
- Prévia de 7 dias em < 10 s; usuário de banco read-only; timeout 30 s.
- Alerta de fan-out: linhas da prévia vs `COUNT(DISTINCT pedido)`.
- **Reconciliação obrigatória**: admin informa valor oficial do mês anterior; diff > 2% bloqueia e mostra causas prováveis (TES, devolução, filial, emissão vs digitação).
- Aba "O que significa": definição em PT, grão, exclusões, gotchas, validado_em/por. Esse texto vai no prompt do agente.

### 3.3 Contratos (colunas = alias obrigatório)

**`clientes`** (diário, completo)
`cliente_cod` `cliente_loja` `cliente_nome` `vendedor_cod` `cidade` `uf` · opcional: `bairro` `endereco` `cep` `cnpj` `bloqueado` (S/N ou 1/2) `limite_credito` `segmento` `ultima_compra`

Referência Protheus: `SA1010` — `A1_COD A1_LOJA A1_NOME A1_VEND A1_MUN A1_EST A1_BAIRRO A1_END A1_CEP A1_CGC A1_MSBLQL A1_LC A1_ULTCOM`, `D_E_L_ET_=' '`, `A1_FILIAL IN ({{FILIAL}})`.

**`vendas`** (carga 13 meses; depois `{{DATA_INI}}`=hoje−7; 4/4h + madrugada; upsert por `pedido+produto_cod`)
`pedido` `data` `cliente_cod` `cliente_loja` `vendedor_cod` `produto_cod` `quantidade` `valor` · opcional: `produto_desc` `grupo_produto`

Referência SD2/SF2 (faturamento):
```sql
SELECT D2_DOC+D2_SERIE AS pedido, D2_EMISSAO AS data, D2_CLIENTE AS cliente_cod,
       D2_LOJA AS cliente_loja, F2_VEND1 AS vendedor_cod, D2_COD AS produto_cod,
       B1_DESC AS produto_desc, D2_QUANT AS quantidade, D2_VALBRUT AS valor, B1_GRUPO AS grupo_produto
FROM SD2010 D2
JOIN SF2010 F2 ON F2_FILIAL=D2_FILIAL AND F2_DOC=D2_DOC AND F2_SERIE=D2_SERIE AND F2.D_E_L_ET_=' '
JOIN SB1010 B1 ON B1_COD=D2_COD AND B1.D_E_L_ET_=' '
JOIN SF4010 F4 ON F4_CODIGO=D2_TES AND F4_DUPLIC='S'
WHERE D2.D_E_L_ET_=' ' AND D2_FILIAL IN ({{FILIAL}})
  AND D2_EMISSAO BETWEEN {{DATA_INI}} AND {{DATA_FIM}}
```
Referência SC5/SC6 (pedido): `C5_NUM AS pedido, C5_EMISSAO AS data, C5_CLIENTE, C5_LOJACLI, C5_VEND1, C6_PRODUTO, C6_QTDVEN, C6_VALOR`, `C6_BLQ<>'R'`, joins análogos.
Texto de ajuda no painel: *"confirme que a consulta exclui devoluções, bonificações e remessas"*.

**`titulos_abertos`** (4/4h, completo)
`titulo` `cliente_cod` `cliente_loja` `vencimento` `valor_saldo` · opcional `dias_atraso`
Referência SE1: `E1_SALDO>0`, `E1_TIPO NOT IN ('NCC','RA','AB-','PA')`.

**`produtos`** (semanal)
`produto_cod` `produto_desc` `grupo` `ativo` · opcional `preco_tabela`

**`meta`** — não é SQL; API fixa do Protheus. Retorno: `vendedor_cod` `periodo`(YYYYMM) `meta_valor` · opcional `meta_positivacao` `meta_mix`. Gravado append-only em `crm_meta_hist`.

**`estoque`** (ao vivo, on-demand, `{{PRODUTO}}`)
`produto_cod` `saldo` · opcional `local`. Fora do motor; aparece como "confirme disponibilidade".

### 3.4 Estratégia de sync

| Consulta | Janela | Frequência |
|---|---|---|
| clientes | completa | diária |
| vendas | 13m inicial; depois hoje−7 (sobreposição cobre cancelamento/reemissão) | 4/4h + madrugada |
| titulos_abertos | completa | 4/4h |
| meta | mês atual + anterior | diária |
| produtos | completa | semanal |

Cada execução grava em `sync_execucao`. Motor recalcula `crm_sinal_cliente` após cada sync de vendas; plano do dia gera às 03h (param por tenant).

**Em aberto**: limite de linhas por consulta para empresas grandes (paginação por data?).

---

## 4. Motor de sinais

### 4.1 Sinais por cliente

| Sinal | Cálculo | Confiança |
|---|---|---|
| `ciclo_dias` | **mediana** dos intervalos entre pedidos distintos (12m) | alta ≥ 8 pedidos · média 3–7 · baixa < 3 (= status `novo`) |
| `dias_sem_compra` | hoje − última compra | — |
| `status` | `novo` (<3 pedidos) · `no_ciclo` (≤ fator_atraso×ciclo) · `atrasado` (fator_atraso×ciclo < d ≤ fator_risco×ciclo) · `risco` (> fator_risco×ciclo ou > risco_dias) · `inativo` (> ativo_dias sem compra) · `bloqueado` (título vencido > bloq_dias ou limite estourado) — bloqueado sobrepõe | — |
| `ticket_medio_cents` | média por pedido 12m | — |
| `tendencia_pct` | ticket 3m vs 12m | queda > 25% = "comprando menos" |
| `mix_habitual` | produtos em ≥ 2 dos últimos 3 ciclos | — |
| `mix_cortado` | habitual ausente no último pedido | "deixou de levar X" |
| `cross_sell` | produtos com alta penetração no segmento/faixa RFM que o cliente nunca comprou (fase 2) | — |
| `rfm_r/f/m`, `rfm_segmento` | quintis (recência, frequência, valor); mín. 30 clientes senão não calcula | Campeões/Fiéis/Em risco/Hibernando/Perdidos/Novos |
| `prob_compra` | por status: no_ciclo 0,8 · atrasado 0,5 · risco 0,2 · novo 0,3 · inativo 0,05 · bloqueado 0 (calibrar fase 3) | — |
| `motivos` jsonb | frases curtas já prontas ("compra a cada 28 dias, está no dia 41") | — |

### 4.2 Sinais por vendedor (meta)

`gap_cents = meta − faturado_mes` · `por_dia = gap / dias_uteis_restantes` · `cobertura_atrasados = Σ ticket×prob dos atrasados+risco` · `cobertura_funil = carteira ativa × ticket esperado / meta` (saudável ≈ 3×).
Decomposição (painel W2): Δreceita = Δclientes_positivados×freq×ticket + Δfreq×… + Δticket×… (método de decomposição sequencial, mostrar valor de cada termo).

### 4.3 Pipeline de ranking (por vendedor, por dia/semana)

```
Source    carteira do vendedor (+ clientes sem vendedor na cidade, fase 2)
Hydrator  junta crm_sinal_cliente, títulos, histórico de sugestões, janela do cliente
Filter    remove: bloqueado (vai para seção "resolver"), visitado nos últimos N dias,
          fora das cidades atendidas, inativo > 12m, pausado pelo gestor, penalidade máxima
Scorer    score_valor   = ticket×prob / máximo
          score_urgencia= f(dias_sem_compra / ciclo)  (0..1, satura em 2×)
          score_risco   = 1 se risco, 0,5 se atrasado, 0 senão
          score_total   = w_v×valor + w_u×urgencia + w_r×risco − penalidade (pesos em cfg_premissa)
Selector  top-K por dia = capacidade (visitas_dia do vendedor)
          diversidade: máx. 60% do mesmo status; agrupamento geográfico (cidade→bairro)
          semana: atribui agrupamento com maior Σscore ao dia 1, repete
SideEffect grava crm_plano + crm_plano_item (origem=motor), score/status "no momento"
```

### 4.4 Roteirização

- **Fase 1**: agrupar por `cidade` (ou `bairro` se uma cidade); ordem = ranking; cada parada abre Waze/Maps por endereço; "abrir rota completa" = URL Maps com waypoints na ordem.
- **Fase 2**: geocodificar `A1_CEP+A1_END` uma vez (cache em `geo_endereco`, refaz só se endereço mudar); ordenar por vizinho-mais-próximo (Haversine; 8 paradas não precisam de API de rotas); `dist_anterior_m`, `tempo_est_min`, `hora_prevista`; janelas opcionais.
- **Fase 3**: check-in grava `crm_visita`; KPIs aderência / positivação da visita / positivação da carteira; `crm_sugestao_historico` penaliza sugerido 3× sem compra; gestor pode fixar/pausar.
- **Não fazer**: VRP completo, frota, janelas rígidas, rastreamento contínuo.

### 4.5 Premissas por tenant (cfg_premissa, com histórico)

`atrasado_fator=1.3` · `risco_fator=2.0` · `risco_dias=90` · `ativo_dias=120` · `ciclo_min_pedidos=3` · `bloq_dias=5` · `visitas_dia=8` · `agrupar_por=cidade|bairro` · `sabado_util=false` · `max_mesmo_status_pct=60` · `peso_valor=40` `peso_urgencia=35` `peso_risco=25` · variações por `segmento` (ex.: atacado `atrasado_fator=1.1`).

**Em aberto**: política de "visitado nos últimos N dias" (N=7?) e se visita sem pedido zera urgência.

---

## 5. Agente

### 5.1 Prompts separados (um por botão)

| Botão | Entrada (fatos JSON) | Saída |
|---|---|---|
| **Hoje** | gap da meta, plano do dia (itens + motivos), cobertura | 1 frase para a home + texto do plano |
| **Semana** | plano por dia, agrupamentos, esperado | resumo + previsão "deve" |
| **Carteira** | distribuição por status, RFM, cresceu/caiu, mix cortado | diagnóstico em 4 blocos |
| **Ficha / antes de entrar** | sinais do cliente, mix, títulos | 3 linhas |
| **Mensagem** | cliente, situação (proposta parada/sumiu/reativar), último pedido, mix, tom do vendedor | texto WhatsApp curto com motivo real e pergunta no fim |
| **Equipe** (gerente) | kpi_diario por vendedor, alertas | texto + alerta |
| **Onde estou perdendo** | decomposição, lista | 1 parágrafo |

Formato fixo por cliente: **O que aconteceu / Por que importa / O que fazer / Confiança.**
Contexto injetado: `DADOS.md` do tenant (definições das consultas, exclusões, gotchas, premissas em prosa) + tom do vendedor.

### 5.2 Self-check determinístico (antes de entregar)

Após a resposta, validar: todo cliente citado existe no JSON; todo número citado existe no JSON (tolerância de arredondamento); nenhum bloqueado com ação de venda; nenhum `novo` afirmado com certeza de ciclo; rodapé de frescor presente. Falhou → regenera 1×; falhou de novo → entrega versão só do motor (sem texto do LLM).

### 5.3 Custo e execução

Job 03h: 1 chamada por vendedor (Hoje) + 1 por gerente (Equipe) → centavos/vendedor/dia. On-demand (Semana, Carteira, Mensagem): cache 4h por (vendedor, tipo). Conjunto de regressão `eval_caso` roda antes de mudar prompt/modelo.

### 5.4 LGPD

Pseudonimizar antes do modelo; nenhum dado de cliente treina nada; rodapé de origem; aviso em Configurações; consulta read-only com usuário dedicado.

---

## 6. App — telas

Base: `addere-inteligencia-wireframes.html`.

| # | Tela | Estado | Conteúdo |
|---|---|---|---|
| 1 | **Hoje** (ex-Dashboard) | refeita | card do plano (visitas, km, esperado, 1º cliente + motivo, "Ver plano" / "Abrir rota"), meta com gap/dia e cobertura, 2 cards pequenos, 3 atalhos de pergunta, pill de sync |
| 2 | **Plano do dia** | nova | toggle lista ⇄ mapa; card por parada (nº, nome, horário/dist, status, porquê, oferta, confiança, Ficha/Mensagem/Cheguei); bloqueado no fim sem "Cheguei"; arrastar/deslizar |
| 3 | **Visita** | nova | "Antes de entrar" (3 linhas), mix sugerido → "Iniciar pedido com esse mix", resultado (pedido/sem/não encontrei/reagendar + motivo), Concluir |
| 4 | **Ficha do cliente** | alterada | bloco "antes de entrar" no topo |
| 5 | **Mensagem** | nova | 3 moldes (proposta parada / sumiu / reativar), ajustes (curta/formal/trocar motivo), Abrir no WhatsApp / Copiar; registra contato |
| 6 | **Semana** | nova | chips por dia, um bairro por dia, lista por dia, previsão "deve" |
| 7 | **Carteira** | nova | barra por status, cresceu/caiu, ruptura de mix, CTA "montar plano só com atrasados" |

Navegação: 5 abas — **Hoje · Rota · Clientes · Pedidos · Produtos**. Ponto ciano em Hoje quando há plano novo.
Ícones (Lucide): `sun` Hoje · `map` Rota · `navigation` Navegar · `map-pin-check` Cheguei · `message-circle` Mensagem · `sparkles` eyebrow do agente · `calendar-days` Semana · `pie-chart` Carteira · `lock` Bloqueado · `refresh-cw` sync.
Cores de status (fixas em toda tela): no ciclo `#16A34A` · atrasado `#D97706` · em risco `#DC2626` · bloqueado `#6B7280` · novo `#7C3AED`. Ciano/navy só para navegação e ação.
Mapa: pino navy com número; anel externo = status; pino vazio = previsto, cheio = visitado.
Offline: plano + sinais baixam no sync; check-in, resultado e feedback entram na fila Zustand existente.

**Em aberto**: aba Rota separada vs toggle dentro de Hoje (recomendação: separada — vendedor abre o mapa dezenas de vezes no dia).

---

## 7. Painel — telas

Base: `addere-painel-web-wireframes.html`. Grupo novo no menu: **Inteligência**.

| # | Tela | Papel | Conteúdo | Fase |
|---|---|---|---|---|
| W3 | **Consultas Protheus** | admin | chips por contrato com status; abas SQL / O que significa / Validar e publicar; checagens; prévia; reconciliação; causas prováveis; versionamento | 1 (primeira) |
| W4 | **Saúde dos dados** | admin+gerente | % saudável, frescor, sem cidade/bairro, sem vendedor, órfãos, histórico de sync, lista exportável "corrigir no Protheus", status de geocodificação | 1 |
| W5 | **Premissas** | admin edita / gerente lê | ciclo e status, rota e capacidade, pesos do ranking, por segmento, histórico | 1 (leitura) |
| W1 | **Equipe em campo** | gerente | 4 KPIs (previstas, realizadas/aderência, positivação da visita, positivação da carteira), mapa da equipe (fase 2), card por vendedor, alerta do motor com Fixar/Concordo | 1 sem mapa → 2 |
| W2 | **Onde estou perdendo** | gerente | decomposição com valor por causa, lista de quem sumiu com "Por no plano", produtos em queda, filtros equipe/vendedor/produto | 2 |
| W6 | **Sugestões & feedback** | admin (gerente lê) | sugestões, aceitas, conversão em 7d vs fora do plano, 👍/👎, clientes sem converter (Fixar/Pausar 30d), comentários com ação, regressão do agente | 3 |

Alterações em telas existentes: **Configurações** + seção Inteligência (ligar por empresa = plano Business+, horário do sync, tom padrão, aviso LGPD); **Vendedores** + visitas/dia, veículo, cidades atendidas; **Visão geral** + cards positivação e saúde.
Regra: sem ranking por faturamento em destaque, sem GPS contínuo.

---

## 8. Modelo de dados (Neon / Postgres)

Convenções: `tenant_id uuid` em tudo; dinheiro em `*_cents bigint`; datas Protheus → `date`; `created_at/updated_at` padrão; RLS por tenant.

### 8.1 Configuração
```
cfg_consulta        id, tenant_id, nome enum(clientes|vendas|titulos|produtos|estoque), sql text,
                    escopo enum(todos|por_vendedor), definicao_pt text, exclusoes text, gotchas text,
                    versao int, validado_em, validado_por, reconciliacao_periodo char(6),
                    reconciliacao_ref_cents, reconciliacao_calc_cents, reconciliacao_diff_pct,
                    publicado bool, publicado_em
cfg_premissa        tenant_id, chave, valor jsonb, segmento null, alterado_por, alterado_em   -- histórico em cfg_premissa_hist
cfg_janela_cliente  tenant_id, cliente_cod, cliente_loja, dia_semana, hora_ini, hora_fim, origem enum(cadastro|vendedor)   -- fase 2
cfg_vendedor        tenant_id, vendedor_cod, visitas_dia, veiculo enum(carro|moto|ape), cidades text[], tom_mensagem
```

### 8.2 Camada analítica (sync)
```
crm_cliente     tenant_id, cliente_cod, cliente_loja, nome, vendedor_cod, cidade, uf, bairro, endereco, cep,
                cnpj, bloqueado bool, limite_credito_cents, segmento, ultima_compra date, sync_em   PK(tenant,cod,loja)
crm_venda_item  tenant_id, pedido, produto_cod, data, cliente_cod, cliente_loja, vendedor_cod,
                quantidade numeric, valor_cents, grupo_produto, sync_em                            PK(tenant,pedido,produto_cod)
crm_titulo      tenant_id, titulo, cliente_cod, cliente_loja, vencimento, saldo_cents, sync_em
crm_produto     tenant_id, produto_cod, descricao, grupo, ativo bool, preco_tabela_cents
crm_meta_hist   tenant_id, vendedor_cod, periodo char(6), meta_cents, meta_positivacao, capturado_em   -- append-only
sync_execucao   id, tenant_id, consulta, iniciado_em, fim_em, linhas, status, erro
```

### 8.3 Motor e plano
```
crm_sinal_cliente  tenant_id, cliente_cod, cliente_loja, calculado_em, ciclo_dias, dias_sem_compra,
                   status enum(novo|no_ciclo|atrasado|risco|inativo|bloqueado), confianca enum(alta|media|baixa),
                   n_pedidos_12m, ticket_medio_cents, tendencia_pct, prob_compra numeric,
                   rfm_r, rfm_f, rfm_m, rfm_segmento, mix_habitual jsonb, mix_cortado jsonb, cross_sell jsonb,
                   score_valor, score_urgencia, score_risco, score_total, motivos jsonb
crm_plano          id, tenant_id, vendedor_cod, data, tipo enum(dia|semana), gerado_em, versao_motor,
                   meta_gap_cents, esperado_cents, agrupamento, resumo_llm text,
                   status enum(gerado|editado|em_andamento|encerrado)
crm_plano_item     id, plano_id, ordem, cliente_cod, cliente_loja, status_no_momento, score_no_momento,
                   motivo_curto, oferta_sugerida jsonb, esperado_cents, origem enum(motor|gestor|vendedor),
                   removido_em, movido_para_plano_id,
                   lat, lng, dist_anterior_m, tempo_est_min, hora_prevista          -- fase 2
crm_mensagem       id, tenant_id, vendedor_cod, cliente_cod, cliente_loja, molde enum(proposta_parada|sumiu|reativar),
                   texto, gerada_em, enviada_em, canal
crm_feedback       id, tenant_id, vendedor_cod, alvo_tipo enum(plano|item|mensagem|resposta), alvo_id,
                   nota smallint, comentario, em
```

### 8.4 Geografia (fase 2)
```
geo_endereco   tenant_id, cliente_cod, cliente_loja, endereco_norm, cep, lat, lng,
               precisao enum(rooftop|rua|cep|cidade), fonte, geocod_em, erro
```

### 8.5 Execução e positivação (fase 3)
```
crm_visita               id, tenant_id, vendedor_cod, cliente_cod, cliente_loja, plano_item_id null,
                         chegada_em, saida_em, lat, lng, precisao_m,
                         resultado enum(pedido|sem_pedido|nao_encontrado|reagendado), motivo_nao_compra,
                         pedido_id null, obs, offline_criado_em, sync_em
kpi_diario_vendedor      tenant_id, vendedor_cod, data, visitas_previstas, visitas_realizadas, visitas_fora_plano,
                         visitas_com_pedido, valor_pedidos_cents, km_estimado, calculado_em
kpi_mensal_vendedor      tenant_id, vendedor_cod, periodo, carteira_total, carteira_positivada, positivacao_pct,
                         recuperados, perdidos, faturado_cents, meta_cents
crm_sugestao_historico   tenant_id, cliente_cod, cliente_loja, vezes_sugerido_30d, vezes_visitado_30d,
                         vezes_comprou_30d, ultimo_resultado, penalidade_score, pausado_ate, fixado_por
eval_caso                id, tenant_id, vendedor_cod, data_congelada, snapshot jsonb, resposta_esperada jsonb,
                         prompt_versao, ultimo_resultado, rodado_em
```

---

## 9. API (Fastify) — endpoints novos (rascunho)

```
POST /admin/consultas/:nome/preview        roda prévia 7d, retorna colunas/linhas/checagens
POST /admin/consultas/:nome/reconciliar    {periodo, ref_cents} → diff + causas
POST /admin/consultas/:nome/publicar
GET  /admin/saude                          frescor, completude, órfãos, execuções
GET/PUT /admin/premissas
GET  /gerente/equipe?data=                 kpis + cards + alertas
GET  /gerente/perdas?periodo=              decomposição + lista
POST /gerente/plano-item                   {vendedor, cliente} origem=gestor
POST /gerente/sugestao/:cliente/fixar|pausar
GET  /app/plano?data=&tipo=dia|semana      (cacheado; baixa no sync)
PATCH /app/plano/:id/itens                 reordenar/remover/mover (origem=vendedor)
GET  /app/cliente/:cod/:loja/antes-de-entrar
POST /app/mensagem                         {cliente, molde} → texto (cache 4h)
POST /app/visita                           check-in / resultado (idempotente, offline-safe)
POST /app/feedback
POST /app/pergunta                         {tipo: carteira|semana|...} on-demand com cache
```

Jobs: `sync:tenant` · `motor:recalcular` · `plano:gerar` · `geo:geocodificar` (fase 2) · `kpi:materializar` (fase 3) · `eval:rodar`.

---

## 10. Fases e entregas

### Fase 1 — MVP (≈ 4–6 semanas, 1 empresa piloto)
- Painel: W3 Consultas (SQL + significado + prévia + reconciliação), W4 Saúde, W5 Premissas (leitura + 5 parâmetros editáveis), W1 Equipe sem mapa, Configurações/Vendedores.
- Sync: clientes, vendas, títulos, produtos, meta. Tabelas 8.1–8.3.
- Motor: ciclo, status, confiança, ticket, tendência, mix habitual/cortado, gap de meta, pipeline com pesos, agrupamento por cidade/bairro.
- Agente: Hoje, Antes de entrar, Mensagem. Self-check. Pseudonimização.
- App: Hoje, Plano do dia (lista; mapa com pinos sem ordenação por distância), Visita (com resultado), Ficha, Mensagem. Aba Rota.
- SideEffect e feedback gravados desde o dia 1. `eval_caso` com 20 casos.

### Fase 2
- Geocodificação, ordenação por distância, hora prevista, janelas; W1 com mapa; Semana; Carteira; RFM; cross-sell; W2 Onde estou perdendo; "Por no plano" do gestor.

### Fase 3
- `crm_visita` completo → KPIs de aderência/positivação; `crm_sugestao_historico` e penalidade; W6 Sugestões & feedback; calibração de `prob_compra` com conversão real; pergunta livre em texto.

### Métricas de sucesso (não medir "uso do botão")
- **Positivação da carteira** (clientes que compraram / carteira ativa) ↑
- **Conversão sugestão → pedido em 7 dias** vs visitas fora do plano
- **Recuperação** (em risco que voltaram a comprar)
- Secundárias: aderência ao plano, tempo de onboarding do tenant (meta: < 3 dias), % de consultas publicadas com reconciliação ok.

---

## 11. Diferenciação e argumentos comerciais

| Dor do mercado (fonte: Reclame Aqui / lojas / material dos concorrentes) | Resposta Addere |
|---|---|
| "O sistema não calcula venda direito" (bonificação/tabela/condição) | Reconciliação obrigatória + definição em PT + rodapé de origem |
| Implantação que estoura prazo (15 dias → meses) | Fonte é o Protheus; onboarding em dias; saúde dos dados no 1º dia |
| Suporte por vídeo gravado; contrato de 12 meses com aditivo | Preço por usuário transparente, sem mínimo escondido; suporte humano |
| Roteiro e IA como caixinha de landing page (todos têm) | Cadeia explicável: ciclo do próprio cliente → prioridade → rota → positivação medida |
| Concorrente direto 4Sales (SAP B1 primeiro, Protheus via parceiro) | Protheus único alvo; lê tabela customizada via SELECT; IA decide *quem*, não só consulta estoque |

Perguntas para demo do 4Sales antes de fechar escopo: offline funciona na versão Protheus? IA responde "quem visito hoje"? campo customizado entra sem projeto?

---

## 12. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| SQL da empresa errado → número errado chega no vendedor | reconciliação bloqueante + alerta de fan-out + dicionário |
| Carteira sem cidade/bairro → plano sem rota | saúde dos dados + fallback "lista sem agrupamento" + lista exportável |
| LLM alucina cliente/valor | fatos JSON + self-check + pseudonimização + fallback só-motor |
| Vendedor abandona por sugestão ruim | confiança explícita, editar é sinal, penalidade por não conversão, feedback 👎 com ação no painel |
| Vigilância percebida | GPS só no check-in; sem ranking em destaque; comunicar na implantação |
| Custo de LLM | job noturno + cache; Sonnet |
| Mudança de modelo/prompt muda comportamento | `eval_caso` antes de qualquer troca |
| Banco do cliente lento | consulta por tenant (não por vendedor), janela de 7 dias, timeout, horário de madrugada |

---

## 13. Próximos passos imediatos

1. Escolher empresa piloto; confirmar SD2/SF2 vs SC5/SC6 e filiais.
2. Validar as 7 telas do app com 2 vendedores reais (5 min, "o que você faria agora?").
3. Criar o repositório/módulo `inteligencia` no backend com as migrations de 8.1–8.3.
4. Implementar W3 Consultas + sync + saúde (onboarding do piloto).
5. Motor v0 (ciclo/status/gap) + Hoje + Antes de entrar.
6. Montar `eval_caso` com dados congelados do piloto.
7. Escrever o `SKILL.md` do agente Addere (molde da Esteira) e os 3 moldes de mensagem.
