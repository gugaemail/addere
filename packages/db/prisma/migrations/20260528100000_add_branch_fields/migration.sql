-- Adiciona campos de cadastro completo e logo à tabela de filiais
ALTER TABLE "branches" ADD COLUMN "razaoSocial" TEXT;
ALTER TABLE "branches" ADD COLUMN "endereco" TEXT;
ALTER TABLE "branches" ADD COLUMN "complemento" TEXT;
ALTER TABLE "branches" ADD COLUMN "cidade" TEXT;
ALTER TABLE "branches" ADD COLUMN "estado" TEXT;
ALTER TABLE "branches" ADD COLUMN "cep" TEXT;
ALTER TABLE "branches" ADD COLUMN "logo" TEXT;
