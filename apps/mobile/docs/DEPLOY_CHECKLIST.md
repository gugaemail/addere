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

## Publicação OTA (`eas update`)

Um update OTA **não** passa pelo perfil de build: o `eas update` resolve a
config com o ambiente da máquina que publica, então o `env` do perfil
`production` do `eas.json` — que é quem garante a URL certa nos builds — não
vale aqui. Quem vale é o `.env` local, e o `.env` de quem desenvolve aponta para
o IP da própria rede.

Publicar OTA sem cuidado manda todo aparelho do canal para um endereço que só
existe na máquina de quem publicou, em `http://` (que o Android bloqueia por
cleartext). O app fica sem backend até o próximo update, e quem está em campo
não tem como voltar atrás sozinho.

São **três** variáveis, e esquecer a terceira é a falha mais silenciosa das
duas. `runtimeVersion` usa a política `appVersion`, e o `version` do app vem de
`EXPO_PUBLIC_APP_VERSION ?? '1.0.0'` (`app.config.js`). Sem ela, o update sai
marcado como runtime **1.0.0** e **não chega em nenhum aparelho** — o build da
loja tem o runtime da versão dele. O comando termina verde, o dashboard mostra
o update publicado, e ninguém recebe nada.

Já aconteceu: em 07/10/2026 o canal `production` ainda tinha, como update mais
recente, um de **três meses antes marcado com runtime 1.0.0**, enquanto a loja
estava na 1.1.1. Nunca chegou a ninguém.

- [ ] Env explícita no comando, nunca confiando no `.env` do disco, e com a
      versão **igual à que está publicada na loja**:

```bash
EXPO_PUBLIC_API_URL=https://api.addere.com.br \
EXPO_PUBLIC_APP_ENV=production \
EXPO_PUBLIC_APP_VERSION=1.1.1 \
npx eas-cli@latest update --channel production --message "<o que mudou>"
```

- [ ] Antes de publicar, conferir o que a config resolve com essa env — se sair
      `Addere Dev` ou `com.addere.app.dev`, a env não foi aplicada:

```bash
EXPO_PUBLIC_APP_ENV=production EXPO_PUBLIC_APP_VERSION=1.1.1 node -e "const c=require('./app.config.js').expo; console.log(c.name, c.version, c.ios.bundleIdentifier)"
```

- [ ] A versão da loja é a de verdade, não a do `eas.json`. Conferir com
      `npx eas-cli@latest channel:view production` (mostra o runtime do último
      update) e com a ficha da loja — na App Store dá para ler sem login em
      `https://itunes.apple.com/lookup?id=6803013404&country=BR`
- [ ] O canal bate com o do build que está na loja (`channel` do perfil no
      `eas.json`: `production` para loja, `preview` para staging). Update no
      canal errado não chega em ninguém — ou chega em quem não devia
- [ ] Mudança é só de JS/TS. Qualquer coisa que toque código nativo (plugin
      novo, permissão, `app.config.js`, versão de SDK) exige **build**, não OTA
- [ ] Depois de publicar: abrir o app num aparelho real, fechar pelo
      gerenciador de tarefas e reabrir (OTA só troca o bundle no restart), e
      confirmar que a tela chama a API certa

## Envio para as lojas (`eas submit`)

O `eas submit` tem a **mesma** armadilha de ambiente do `eas update`: resolve o
`app.config.js` com o ambiente da máquina, e sem `EXPO_PUBLIC_APP_ENV` o config
cai no default `development` e procura credenciais do bundle errado
(`com.addere.app.dev` em vez de `com.addere.app`). Em 05/10/2026 isso passou
despercebido porque a chave do App Store Connect é de conta, não de bundle — mas
com credencial amarrada ao bundle a busca falha.

- [ ] Env explícita, como no OTA:

```bash
EXPO_PUBLIC_APP_ENV=production npx eas-cli@latest submit --platform ios --profile production --latest
```

- [ ] **Usar `eas-cli@latest`, não o instalado.** Erro da Apple é a causa mais
      provável de um envio falhar, e a versão antiga do CLI esconde a mensagem.
      Em 05/10/2026 o `eas-cli` 19.0.5 imprimia apenas
      `Something went wrong when submitting your app to Apple App Store Connect`
      em quatro tentativas seguidas; o 24.10.0, no mesmo envio, mostrou a causa:

      ```
      Apple 403 detected - Access forbidden.
      A required agreement is missing or has expired.
      ```

- [ ] Nenhum contrato pendente no App Store Connect, em **Business** (contas
      antigas: *Agreements, Tax, and Banking*). A Apple atualiza o Developer
      Program License Agreement de tempos em tempos e **bloqueia upload de
      binário** até ser reaceito — dados fiscais ou bancários incompletos travam
      igual. Só o Account Holder assina; não há como contornar pelo EAS
- [ ] Aceitou o contrato e o 403 continua? Confira **todos** os contratos da
      lista, não só o que estava em destaque: o status de cada um precisa estar
      ativo, não pendente. Contrato aceito mas com formulário fiscal ou conta
      bancária incompletos permanece pendente e segue bloqueando. A entrada em
      vigor também não é instantânea — vale esperar e reenviar antes de procurar
      outra causa
- [ ] Falhou o envio, mas o build está íntegro? **Reenvie, não rebuilde.** O
      `.ipa`/`.aab` continua no EAS e o `--latest` pega ele de novo; rebuildar só
      queima um buildNumber/versionCode à toa

## Pós-deploy

- [ ] Health check do admin respondendo 200: `GET /api/health`
- [ ] Sentry dashboard sem spike de erros novos
- [ ] Primeiro usuário piloto consegue fazer login
