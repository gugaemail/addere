# Testes E2E (Detox)

Os fluxos em `flows/` cobrem login, pedido online e a fila offline
(sync, retry e restart do app com itens pendentes).

## Pré-requisitos

Os testes rodam sobre um build nativo — o projeto usa Expo managed, então é
preciso gerar as pastas `ios/` e `android/` antes do primeiro `detox build`:

```bash
cd apps/mobile
npx expo prebuild            # gera ios/ e android/ (não versionados)
npm run test:e2e:build:ios   # ou o equivalente Android
npm run test:e2e:ios         # ou test:e2e:android
```

Requer uma API acessível em `EXPO_PUBLIC_API_URL` com os usuários de teste
`rep@addere.test` / `manager@addere.test` (senha `test123`) — veja
`helpers/auth.ts`.

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
| `tab-dashboard`, `tab-clientes`, `tab-produtos`, `tab-pedidos`                  | abas do `Tabs` em `(app)/_layout.tsx` (`tabBarButtonTestID`) |
| `btn-novo-pedido`                                                               | FAB em `(app)/pedidos/index.tsx`                             |
| `input-busca-cliente`, `resultado-cliente-{i}`, `btn-adicionar-produto-{i}`     | wizard passo 1 — busca, cliente e filial (`novo-pedido`)     |
| `produto-lista`, `produto-{i}`, `cache-badge`, `btn-proximo-step`               | wizard passo 2 — produtos                                    |
| `btn-confirmar-pedido`                                                          | wizard passo 3 — confirmação                                 |
| `sync-status-offline/syncing/error/pending/ok`                                  | `SyncStatusBar` (montado em `(app)/pedidos/index.tsx`)       |
| `queue-count-badge`, `queue-item-{i}`, `retry-item-{id}`, `empty-queue-message` | `(app)/pedidos/pendentes.tsx`                                |

Observações:

- A tela após o login é a Dashboard; o FAB `btn-novo-pedido` fica na aba **Pedidos** —
  use o helper `goToPedidos()` de `e2e/helpers/navigation.ts` (toca `tab-pedidos` e aguarda o FAB).
- `btn-adicionar-produto-{i}` é o card de **filial** do passo 1 (nome mantido por
  compatibilidade com os fluxos existentes).
- O sucesso do pedido é um `Alert` nativo: título `Pedido criado` (online) ou
  `Pedido salvo offline`, com botão `OK` — use `by.label(...)`.

Os testes unitários (`npm run test:unit`) não dependem do Detox e rodam no CI.
