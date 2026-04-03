-- Adiciona campos de configuração de sincronização Protheus na tabela companies

ALTER TABLE "companies"
  ADD COLUMN "apiToken" TEXT,
  ADD COLUMN "syncConfig" JSONB;
