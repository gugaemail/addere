# Checklist de deploy — Addere

## Pré-deploy (rodar sempre antes de qualquer build de produção)

### Código

- [ ] `npm run type-check` sem erros
- [ ] `npm test -- --watchAll=false` todos passando
- [ ] Nenhum `console.log` com dados de pedido ou PII
- [ ] `npx expo-doctor` sem regressão (2 falhas são esperadas: `metro.config` e
      `react` duplicado — as duas faces do mesmo ajuste de monorepo, ver o
      comentário em `metro.config.js`)
- [ ] `eas env:list production` mostra as cinco variáveis da tabela abaixo

### Variáveis do ambiente `production` no EAS

O que **não** entra aqui: `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_API_URL` e
`EXPO_PUBLIC_APP_VERSION` já estão fixos no perfil `production` do `eas.json`,
onde ficam versionados e auditáveis.

| Variável                      | Visibilidade | Sem ela                                          |
| ----------------------------- | ------------ | ------------------------------------------------ |
| `GOOGLE_MAPS_ANDROID_API_KEY` | sensitive    | mapa cinza na Rota (Android usa PROVIDER_GOOGLE) |
| `EXPO_PUBLIC_SENTRY_DSN`      | sensitive    | nenhum erro chega no dashboard                   |
| `SENTRY_ORG`                  | plaintext    | source map não sobe                              |
| `SENTRY_PROJECT`              | plaintext    | source map não sobe                              |
| `SENTRY_AUTH_TOKEN`           | secret       | source map não sobe                              |

### Credenciais de envio (onde cada uma mora)

Nenhuma delas é arquivo no disco. Ficam no servidor do EAS, em
`expo.dev/accounts/gugaemail/projects/addere/credentials`.

| Plataforma | Credencial                  | Observação                                                                                                                                                 |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android    | Keystore de upload          | gerenciado pelo EAS; quem assina o APK que chega no aparelho é o Play App Signing, não ele                                                                 |
| Android    | Google service account key  | `eas-submit@addere-509602.iam.gserviceaccount.com`, com acesso **só ao app Addere** e sem permissão de produção — promover é clique humano no Play Console |
| iOS        | Distribuição + provisioning | gerenciados pelo EAS; `appleId`/`appleTeamId`/`ascAppId` ficam no `eas.json`                                                                               |

O `eas.json` **não** aponta para `serviceAccountKeyPath`: com um caminho de
arquivo ali, o `eas submit` ignora a chave do servidor e falha se o arquivo não
existir. `apps/mobile/google-service-account.json` segue no `.gitignore` só como
rede de proteção para quem baixar o JSON por engano.

### Versão

O `version` do app vem de `EXPO_PUBLIC_APP_VERSION`; o `app.config.js` só guarda
o fallback. Para o build de loja o valor está no perfil `production` do
`eas.json` — é lá que se sobe a versão, não no `app.config.js`.

- [ ] `EXPO_PUBLIC_APP_VERSION` do perfil `production` (`eas.json`) na versão nova
- [ ] `versionCode` (Android) e `buildNumber` (iOS) **não** editados à mão — o
      `appVersionSource: "remote"` + `autoIncrement` deixa isso com o EAS.
      Conferir o ponto de partida com `eas build:version:get -p <plataforma>`
- [ ] Tag git criada: `git tag v1.x.x`
- [ ] CHANGELOG.md atualizado via `./scripts/release-notes.sh v1.x.x`

### Sentry

Um build de produção sem source map devolve stack de bytecode Hermes minificado:
você fica sabendo que quebrou, não onde. Por isso o perfil `production` do
`eas.json` **não** define `SENTRY_DISABLE_AUTO_UPLOAD` (development e preview
definem, porque lá o upload só gastaria cota).

- [ ] `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` e
      `SENTRY_AUTH_TOKEN` no ambiente `production` do EAS
- [ ] No log do build, confirmar que o passo do `sentry-cli` subiu os source maps
      — sem o token ele passa batido e o build termina verde mesmo assim
- [ ] Forçar um erro no aparelho e conferir no dashboard que a stack aponta para
      o arquivo `.tsx` certo, não para `index.android.bundle`

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
