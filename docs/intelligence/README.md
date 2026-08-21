# Camada de Inteligência — notas de engenharia

Documento vivo do módulo de inteligência comercial. Plano de execução completo em
`ADDERE-INTELIGENCIA-PLANO-EXECUCAO.md` (branch `docs/plano-inteligencia` até o merge).

## Migrations — procedimento

O banco (Neon) não é acessível localmente. Fluxo para criar uma migration:

1. Subir o Postgres local (`docker compose up -d db`, ou o postgresql@17 do Homebrew).
2. Gerar o **delta** (nunca usar `--from-empty` para deltas — ele gera o schema inteiro):

   ```bash
   cd packages/db
   DATABASE_URL=postgresql://<user>@localhost:5432/<db_teste> \
     npx prisma migrate dev --create-only --name <descricao_snake>
   ```

   Alternativa sem `migrate dev`:

   ```bash
   npx prisma migrate diff \
     --from-migrations ./prisma/migrations \
     --to-schema-datamodel ./prisma/schema.prisma \
     --shadow-database-url postgresql://<user>@localhost:5432/<db_sombra> \
     --script > prisma/migrations/<timestamp>_<descricao>/migration.sql
   ```

3. Validar antes do PR (checklist do plano, §9):
   - banco limpo → `migrate deploy` → `migrate diff --from-url <banco> --to-schema-datamodel` retorna vazio;
   - banco simulando produção (colunas já existentes) → `migrate deploy` aplica sem erro.
4. Nunca editar migration já aplicada em staging/produção.

### Colunas que podem já existir em produção

Produção/staging receberam colunas via `prisma db push` no passado (drift). A migration
`20260820000000_baseline_drift` regularizou esse histórico com `IF NOT EXISTS` em tudo —
é o modelo a imitar quando uma coluna nova *pode* já existir no ambiente
(ver também `20260403000002_fase6_campos`).

## Migrations — rollback

`prisma migrate deploy` roda no build do Render (`render.yaml`) e no `deploy-api.yml`.
Se uma migration falhar em produção:

1. O deploy para — a API continua na versão anterior (o build falhou antes do start).
2. Corrigir exige **nova** migration (roll forward) ou marcar a falha como revertida:

   ```bash
   npx prisma migrate resolve --rolled-back <nome_da_migration>
   ```

   e então publicar a versão corrigida com outro nome.
3. Para desfazer uma migration já aplicada, escrever migration inversa explícita
   (`DROP COLUMN`/`DROP INDEX` etc.) — nunca apagar a pasta da migration original.
4. Migrations de risco (baseline, enum, uniques em tabela populada) sobem para staging
   em janela separada dos demais PRs.

## Histórico

- **E1a (20/08/2026)** — `20260820000000_baseline_drift`: 12 colunas (`companies.fieldConfig/syncSchedule`,
  `customers.msblql/transpPadrao/condPagPadrao/tes/xcodemp`, `order_items.largura/espessura/tara/encolhimento/xcrav`)
  e 6 índices/uniques (`cond_pags`/`transportadoras` unique por empresa+código, índices de
  `customers`/`products`/`orders`) que existiam no schema e em produção mas não nas migrations.
  Drift levantado com `migrate diff` contra banco só-de-migrations; testes: banco limpo sem
  drift residual, reaplicação idempotente (NOTICE ... skipping).
