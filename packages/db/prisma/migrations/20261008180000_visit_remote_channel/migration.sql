-- Atendimento à distância (plano 011): origem REMOTE na visita e o canal
-- (telefone/WhatsApp), só preenchido no REMOTE. Sem backfill.

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('PHONE', 'WHATSAPP');

-- AlterEnum
ALTER TYPE "VisitSource" ADD VALUE 'REMOTE';

-- AlterTable
ALTER TABLE "intel_visits" ADD COLUMN     "channel" "ContactChannel";
