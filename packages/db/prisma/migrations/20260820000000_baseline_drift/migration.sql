-- Baseline do drift de schema (E1a — camada de Inteligência, pré-requisito).
-- Colunas e índices que existem no schema.prisma e nos bancos de produção/staging
-- (criados via `prisma db push`) mas nunca entraram em migration.
-- Gerado a partir de `prisma migrate diff --from-url <banco-só-migrations> --to-schema-datamodel`.
-- Idempotente: seguro em banco limpo, em staging e em produção (IF NOT EXISTS em tudo).

-- companies: configurações por empresa gravadas via painel (db push histórico)
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fieldConfig" JSONB;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "syncSchedule" JSONB;

-- customers: campos Protheus adicionados no sync de clientes (SA1)
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "msblql" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "transpPadrao" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "condPagPadrao" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tes" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "xcodemp" TEXT;

-- order_items: campos dimensionais do item de pedido
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "largura" DECIMAL(10,3);
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "espessura" DECIMAL(10,3);
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "tara" DECIMAL(10,3);
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "encolhimento" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "xcrav" TEXT;

-- Índices/uniques presentes no schema mas ausentes das migrations.
-- Obs.: se algum ambiente tiver dados que violem os uniques (não deveria — prod
-- foi criado via db push do mesmo schema, então eles já existem lá e o
-- IF NOT EXISTS pula), o deploy falha explicitamente e o dado deve ser corrigido.
CREATE UNIQUE INDEX IF NOT EXISTS "cond_pags_companyId_protheusCode_key" ON "cond_pags"("companyId", "protheusCode");
CREATE UNIQUE INDEX IF NOT EXISTS "transportadoras_companyId_protheusCode_key" ON "transportadoras"("companyId", "protheusCode");
CREATE INDEX IF NOT EXISTS "customers_companyId_active_idx" ON "customers"("companyId", "active");
CREATE INDEX IF NOT EXISTS "products_companyId_active_idx" ON "products"("companyId", "active");
CREATE INDEX IF NOT EXISTS "orders_userId_companyId_idx" ON "orders"("userId", "companyId");
CREATE INDEX IF NOT EXISTS "orders_companyId_status_idx" ON "orders"("companyId", "status");
