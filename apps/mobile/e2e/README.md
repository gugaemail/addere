# Testes E2E (Detox)

Os fluxos em `flows/` cobrem login, pedido online e a fila offline
(sync, retry e restart do app com itens pendentes).

> Os fluxos `order-offline-*` só rodam no **Android**: eles desligam WiFi/dados do
> emulador via `adb` para o NetInfo reportar offline. No simulador iOS o
> `setURLBlacklist` bloqueia HTTP, mas o NetInfo continua "conectado" e a
> `SyncStatusBar` nunca entra em modo offline. `auth` e `order-online` rodam nos dois.

## Pré-requisitos

No iOS o Detox precisa do `applesimutils` (`brew tap wix/brew && brew install applesimutils`).

Os testes rodam sobre um build nativo — o projeto usa Expo managed, então é
preciso gerar as pastas `ios/` e `android/` antes do primeiro `detox build`:

```bash
cd apps/mobile
npx expo prebuild            # gera ios/ e android/ (não versionados)
npm run test:e2e:build:ios   # ou o equivalente Android
npm run test:e2e:ios         # ou test:e2e:android
```

Requer uma API acessível em `EXPO_PUBLIC_API_URL` com os usuários de teste
`rep@addere.test` / `manager@addere.test` (senha `test1234`) — veja
`helpers/auth.ts`. Eles são criados pelo seed (`npm run seed` em `packages/db`)
em qualquer ambiente que não seja produção.

O nome do projeto iOS gerado pelo prebuild depende de `EXPO_PUBLIC_APP_ENV`
(`AddereDev`, `AddereStaging`, `Addere`); o `.detoxrc.js` detecta o `.xcworkspace`
existente em `ios/`, então basta rodar o prebuild antes do `detox build`.

## Tipos

Os fluxos importam `{ by, device, element, expect, waitFor }` de `'detox'` (tipos que o
próprio Detox 20 traz) — não use os globais nem `@types/detox` (desatualizado), senão o
`expect` do Jest sobrepõe o do Detox no type-check. No Android, `helpers/network.ts`
alterna WiFi/dados via `adb` (`execSync` no runner), pois o Detox não executa comandos
no device.

## testIDs esperados pelos fluxos

Todos os testIDs abaixo existem no código (confira com `grep -rn testID app src`).

| testID                                                                          | Onde                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `input-email`, `input-password`, `btn-login`, `error-login`                     | `src/screens/auth/LoginScreen.tsx`                           |
| `screen-home`                                                                   | dashboard `(app)/index.tsx` (ScrollView raiz)                |
| `screen-onboarding`, `btn-onboarding-next`                                      | `src/components/onboarding/OnboardingFlow.tsx` (1º login)    |
| `tab-dashboard`, `tab-clientes`, `tab-produtos`, `tab-pedidos`                  | abas do `Tabs` em `(app)/_layout.tsx` (`tabBarButtonTestID`) |
| `tab-hoje`, `tab-rota` (E12)                                                    | abas da Inteligência — só existem com `intelligenceEnabled`; `tab-dashboard`/`screen-home` continuam valendo com a flag desligada |
| `screen-hoje`, `screen-rota`, `card-plano-do-dia`, `sync-pill`, `freshness-footer` (E12) | telas Hoje/Rota e componentes da Inteligência |
| `btn-novo-pedido`                                                               | FAB em `(app)/pedidos/index.tsx`                             |
| `input-busca-cliente`, `resultado-cliente-{i}`, `btn-adicionar-produto-{i}`     | wizard passo 1 — busca, cliente e filial (`novo-pedido`)     |
| `produto-lista`, `produto-{i}`, `cache-badge`, `btn-proximo-step`               | wizard passo 2 — produtos                                    |
| `scroll-confirmacao`, `btn-confirmar-pedido`                                    | wizard passo 3 — ScrollView do resumo e confirmação          |
| `sync-status-offline/syncing/error/pending/ok`                                  | `SyncStatusBar` (montado em `(app)/pedidos/index.tsx`)       |
| `queue-count-badge`, `queue-item-{i}`, `retry-item-{id}`, `empty-queue-message` | `(app)/pedidos/pendentes.tsx`                                |

Observações:

- Todo fluxo deve começar com `launchFreshApp()` (`e2e/helpers/auth.ts`): reinstala o app e,
  no iOS, limpa o keychain — sem isso a sessão do SecureStore sobrevive ao relaunch.
- No primeiro login o app mostra o onboarding (3 telas); `loginAs()` já avança por ele
  (`dismissOnboardingIfShown`) antes de esperar `screen-home`.
- A tela após o login é a Dashboard; o FAB `btn-novo-pedido` fica na aba **Pedidos** —
  use o helper `goToPedidos()` de `e2e/helpers/navigation.ts` (toca `tab-pedidos` e aguarda o FAB).
- `btn-adicionar-produto-{i}` é o card de **filial** do passo 1 (nome mantido por
  compatibilidade com os fluxos existentes).
- O sucesso do pedido é um `Alert` nativo: título `Pedido criado` (online) ou
  `Pedido salvo offline`, com botão `OK` — use `by.text(...)`.

Os testes unitários (`npm run test:unit`) não dependem do Detox e rodam no CI.
