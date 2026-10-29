-- Preço por UF (tabela de preço com UF): a apiPord manda um registro por
-- produto e UF. UF em branco é o preço geral, que continua em "price"; os
-- demais ficam em "ufPrices" ({ "SP": 11.2 }) e valem para cliente daquela UF.
-- Coluna nula: empresa que não usa UF não muda nada.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "ufPrices" JSONB;
