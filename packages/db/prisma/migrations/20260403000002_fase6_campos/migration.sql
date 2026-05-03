-- Adiciona colunas da Fase 6 (integração Protheus) e campos auxiliares
-- Usa IF NOT EXISTS para ser idempotente em bancos criados do zero

-- DropIndex
DROP INDEX IF EXISTS "customers_companyId_protheusCode_key";

-- AlterTable companies
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "apiCliente" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "apiCondPag" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "apiConsPed" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "apiMetaVend" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "apiPedido" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "apiPord" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "apiTransp" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "passProtheus" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "usrProtheus" TEXT;

-- AlterTable customers
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "bairro" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "cep" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "loja" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "municipio" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "uf" TEXT;

-- AlterTable order_items
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "descricao" TEXT;

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "condId" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "emissao" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "mennota" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "transportId" TEXT;

-- AlterTable products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "saldo" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "idVendProt" TEXT;

-- CreateTable transportadoras
CREATE TABLE IF NOT EXISTS "transportadoras" (
    "id" TEXT NOT NULL,
    "protheusCode" TEXT,
    "nome" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transportadoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable cond_pags
CREATE TABLE IF NOT EXISTS "cond_pags" (
    "id" TEXT NOT NULL,
    "protheusCode" TEXT,
    "nome" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cond_pags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex customers
CREATE UNIQUE INDEX IF NOT EXISTS "customers_companyId_loja_protheusCode_key" ON "customers"("companyId", "loja", "protheusCode");

-- AddForeignKey (idempotente via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transportadoras_companyId_fkey') THEN
    ALTER TABLE "transportadoras" ADD CONSTRAINT "transportadoras_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cond_pags_companyId_fkey') THEN
    ALTER TABLE "cond_pags" ADD CONSTRAINT "cond_pags_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_transportId_fkey') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "transportadoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_condId_fkey') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_condId_fkey" FOREIGN KEY ("condId") REFERENCES "cond_pags"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
