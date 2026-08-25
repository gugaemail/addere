# Checklist de deploy — Addere

## Pré-deploy (rodar sempre antes de qualquer build de produção)

### Código

- [ ] `npm run type-check` sem erros
- [ ] `npm test -- --watchAll=false` todos passando
- [ ] Nenhum `console.log` com dados de pedido ou PII
- [ ] Variáveis de ambiente de produção configuradas no EAS secrets

### Versão

- [ ] `app.config.js` version e `EXPO_PUBLIC_APP_VERSION` atualizados
- [ ] Tag git criada: `git tag v1.x.x`
- [ ] CHANGELOG.md atualizado via `./scripts/release-notes.sh v1.x.x`

### Sentry

- [ ] DSN de produção configurado no EAS secret `EXPO_PUBLIC_SENTRY_DSN`
- [ ] Testar que erros aparecem no dashboard Sentry após build
- [ ] Source maps configurados no build de produção

### Localização (E12/D10)

O GPS é lido **uma vez**, no toque em "Cheguei" da visita — `when-in-use`, nunca
em background (`isAndroidBackgroundLocationEnabled: false` em `app.config.js`).

- [ ] Texto da permissão em `app.config.js` explica _quando_ e _para quê_ — a App
      Store recusa build cujo texto seja genérico
- [ ] Negar a permissão no aparelho e confirmar que o check-in **acontece assim
      mesmo**, sem coordenada — o vendedor não pode ficar travado por causa do GPS
- [ ] `GOOGLE_MAPS_ANDROID_API_KEY` no ambiente do build **Android** — sem ela o
      mapa do plano sai em branco (o iOS usa Apple Maps e não precisa)
- [ ] Coordenadas somem depois de 90 dias (job `PURGE`) — conferir em staging
      antes do primeiro piloto real

### testIDs

Os fluxos Detox em `e2e/flows/` dependem destes identificadores. **Renomear ou
remover um deles quebra o e2e sem quebrar o type-check** — se mexer numa tela,
rode `npm run test:e2e:ios` antes de abrir o PR.

| Área         | testIDs                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Login        | `input-email`, `input-password`, `btn-login`, `error-login`                                                                        |
| Telas        | `screen-hoje`, `screen-rota`, `screen-visita`                                                                                      |
| Plano        | `card-plano-do-dia`, `plan-item-1`, `before-enter`                                                                                 |
| Visita       | `btn-cheguei-1`, `btn-concluir-visita`, `resultado-NO_ORDER`, `resultado-RESCHEDULED`, `input-motivo`                              |
| Pedido       | `btn-novo-pedido`, `produto-lista`, `btn-tirar-1`                                                                                  |
| Fila offline | `sync-pill`, `queue-count-badge`, `queue-item-0`, `empty-queue-message`, `sync-status-offline`, `sync-status-error`, `cache-badge` |

- [ ] `npm run test:e2e:ios` verde (build antes com `npm run test:e2e:build:ios`;
      exige `expo prebuild` — ver `e2e/README.md`)

### Testes manuais obrigatórios

- [ ] Login → criar pedido online → confirmar sync
- [ ] Desligar wifi → criar pedido → ligar wifi → confirmar sync automático
- [ ] Restart do app com pedido na fila → confirmar que não perde
- [ ] Testar em dispositivo físico (não só simulador)
- [ ] **Sessão sobrevive a restart**: logar, fechar o app pelo gerenciador de
      tarefas, reabrir — tem de voltar em "Olá, <nome>", nunca no dashboard com o
      nome vazio (regressão de sessão meio-restaurada)
- [ ] Com a Inteligência ligada: Hoje → Plano do dia → "Cheguei" → registrar
      resultado, e conferir a visita na Equipe em campo do painel

## Pós-deploy

- [ ] Health check do admin respondendo 200: `GET /api/health`
- [ ] Sentry dashboard sem spike de erros novos
- [ ] Primeiro usuário piloto consegue fazer login
