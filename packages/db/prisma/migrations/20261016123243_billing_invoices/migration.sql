-- Faturamento mensal pós-pago (plano 016): faturas e itens, com uma fatura
-- por empresa e competência — a chave única é a idempotência do gerador. O
-- contrato ganha os campos do cancelamento com efeito no fim do mês.
-- Tabelas novas e vazias; as colunas novas são opcionais ou têm default.

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceOrigin" AS ENUM ('JOB', 'MANUAL');

-- CreateEnum
CREATE TYPE "InvoiceItemKind" AS ENUM ('PACKAGE', 'EXTRA_SEATS', 'DISCOUNT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "InvoicePaymentMethod" AS ENUM ('PIX', 'BOLETO', 'TRANSFER', 'CARD', 'OTHER');

-- AlterTable
ALTER TABLE "billing_company_contracts" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "cancelRequestedById" TEXT,
ADD COLUMN     "deactivateCompanyOnEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "endsAt" DATE;

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "competence" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "origin" "InvoiceOrigin" NOT NULL DEFAULT 'JOB',
    "termsId" TEXT,
    "total" DECIMAL(14,2) NOT NULL,
    "paidAt" DATE,
    "paidAmount" DECIMAL(14,2),
    "paymentMethod" "InvoicePaymentMethod",
    "paymentNote" TEXT,
    "paidById" TEXT,
    "paidByName" TEXT,
    "nfNumber" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledByName" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoice_items" (
    "id" TEXT NOT NULL,
    "kind" "InvoiceItemKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT NOT NULL,

    CONSTRAINT "billing_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_number_key" ON "billing_invoices"("number");

-- CreateIndex
CREATE INDEX "billing_invoices_status_dueDate_idx" ON "billing_invoices"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_companyId_competence_key" ON "billing_invoices"("companyId", "competence");

-- CreateIndex
CREATE INDEX "billing_invoice_items_invoiceId_idx" ON "billing_invoice_items"("invoiceId");

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoice_items" ADD CONSTRAINT "billing_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "billing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

