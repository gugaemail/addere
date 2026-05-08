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

### Testes manuais obrigatórios
- [ ] Login → criar pedido online → confirmar sync
- [ ] Desligar wifi → criar pedido → ligar wifi → confirmar sync automático
- [ ] Restart do app com pedido na fila → confirmar que não perde
- [ ] Testar em dispositivo físico (não só simulador)

## Pós-deploy

- [ ] Health check do admin respondendo 200: `GET /api/health`
- [ ] Sentry dashboard sem spike de erros novos
- [ ] Primeiro usuário piloto consegue fazer login
