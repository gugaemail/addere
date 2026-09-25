# AGENT_SKILL — prompts do agente da Inteligência (E6)

**Fonte executável:** `apps/api/src/modules/intelligence/agent/skill-prompt.ts`
(`AGENT_SKILL`). Este arquivo documenta o contrato; edite o `.ts` e mantenha
os dois em sincronia. `promptVersion` = sha256 do texto do skill (8 chars) —
qualquer mudança muda a versão e o eval passa a rodar contra ela.

## Estrutura

- **Skill (sistema, cacheado 1h):** persona + 7 regras invariantes (só fatos
  do JSON; pseudônimos C1/C2; bloqueado nunca recebe ação de venda; novo nunca
  tem certeza de ciclo; números só dos fatos; linha de frescor; tom direto).
- **DADOS.md do tenant (sistema, cacheado 1h):** definições/exclusões/gotchas
  das consultas publicadas + premissas do motor em prosa + tom padrão
  (`tenant-context.ts`).
- **Prompt por botão (usuário):** `prompts/today.ts` (home + plano),
  `prompts/briefing.ts` (O que aconteceu / Por que importa / O que fazer /
  Confiança), `prompts/message.ts` (WhatsApp com motivo real + pergunta).
  Saída estruturada via `output_config.format` (json_schema).

## Guard-rails (não são prompt — são código)

1. `facts.ts`: allowlist de chaves + varredura de valores (CNPJ/CPF/e-mail/
   CEP/telefone). Nome do cliente NUNCA entra — pseudônimo por requisição
   (`pseudonymizer.ts`), reidratado só na resposta ao usuário.
2. `self-check.ts` (§5.2): cliente citado existe; número citado existe
   (tolerância de arredondamento); bloqueado sem ação de venda; novo sem
   certeza de ciclo; linha de frescor. Reprova → regenera 1× → só-motor.
3. `agent.service.ts`: cache 4h por (companyId, kind, vendorCode, targetKey);
   cap diário de tokens por tenant (`INTEL_LLM_DAILY_TOKEN_CAP`, D13).

## Pendência E0-8 (Gustavo)

Refinar o texto do skill + 3 templates de mensagem (proposta parada / sumiu /
reativação) com exemplos reais da empresa piloto. Antes de publicar mudança:
`npm run intel:freeze-eval -w @addere/api` (uma vez) e
`npm run intel:eval -w @addere/api` (a cada mudança de prompt/modelo).
