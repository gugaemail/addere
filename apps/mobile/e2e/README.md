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

## testIDs esperados pelos fluxos

| testID | Onde |
|---|---|
| `input-email`, `input-password`, `btn-login`, `error-login` | LoginScreen |
| `screen-home` | dashboard `(app)/index.tsx` |
| `btn-novo-pedido` | FAB em `(app)/pedidos/index.tsx` |
| `input-busca-cliente`, `resultado-cliente-{i}` | wizard passo 1 |
| `btn-proximo-step`, `btn-adicionar-produto-{i}` | wizard passos 2/3 |
| `btn-confirmar-pedido` | wizard passo 3 |
| `sync-status-*` | `SyncStatusBar` (montado em pedidos) |
| `empty-queue-message`, `retry-item-*` | `(app)/pedidos/pendentes.tsx` |

Os testes unitários (`npm run test:unit`) não dependem do Detox e rodam no CI.
