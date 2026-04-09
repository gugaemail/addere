-- Adiciona colunas da Fase 6 (integração Protheus) e campos auxiliares

-- DropIndex
DROP INDEX "customers_companyId_protheusCode_key";

-- AlterTable companies: endpoints e credenciais Protheus
ALTER TABLE "companies" ADD COLUMN     "apiCliente" TEXT,
ADD COLUMN     "apiCondPag" TEXT,
ADD COLUMN     "apiConsPed" TEXT,
ADD COLUMN     "apiMetaVend" TEXT,
ADD COLUMN     "apiPedido" TEXT,
ADD COLUMN     "apiPord" TEXT,
ADD COLUMN     "apiTransp" TEXT,
ADD COLUMN     "passProtheus" TEXT,
ADD COLUMN     "usrProtheus" TEXT;

-- AlterTable customers: campos de endereço Protheus
ALTER TABLE "customers" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "loja" TEXT,
ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "uf" TEXT;

-- AlterTable order_items: descrição do item
ALTER TABLE "order_items" ADD COLUMN     "descricao" TEXT;

-- AlterTable orders: campos de pedido Protheus
ALTER TABLE "orders" ADD COLUMN     "condId" TEXT,
ADD COLUMN     "emissao" TIMESTAMP(3),
ADD COLUMN     "mennota" TEXT,
ADD COLUMN     "transportId" TEXT;

-- AlterTable products: saldo disponível
ALTER TABLE "products" ADD COLUMN     "saldo" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable users: código do vendedor no Protheus
ALTER TABLE "users" ADD COLUMN     "idVendProt" TEXT;

-- CreateTable transportadoras
CREATE TABLE "transportadoras" (
    "id" TEXT NOT NULL,
    "protheusCode" TEXT,
    "nome" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transportadoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable cond_pags
CREATE TABLE "cond_pags" (
    "id" TEXT NOT NULL,
    "protheusCode" TEXT,
    "nome" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cond_pags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex customers: índice único composto com loja
CREATE UNIQUE INDEX "customers_companyId_loja_protheusCode_key" ON "customers"("companyId", "loja", "protheusCode");

-- AddForeignKey
ALTER TABLE "transportadoras" ADD CONSTRAINT "transportadoras_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cond_pags" ADD CONSTRAINT "cond_pags_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "transportadoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_condId_fkey" FOREIGN KEY ("condId") REFERENCES "cond_pags"("id") ON DELETE SET NULL ON UPDATE CASCADE;
