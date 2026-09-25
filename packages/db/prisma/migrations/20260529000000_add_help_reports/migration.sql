-- Cria tabela de reportes de problemas da Central de Ajuda
-- Seguro para rodar mesmo se a tabela já existe (criada via db push)

CREATE TABLE IF NOT EXISTS "help_reports" (
    "id"            TEXT         NOT NULL,
    "userId"        TEXT         NOT NULL,
    "type"          TEXT         NOT NULL,
    "description"   TEXT         NOT NULL,
    "appVersion"    TEXT,
    "device"        TEXT,
    "screenshotUrl" TEXT,
    "status"        TEXT         NOT NULL DEFAULT 'aberto',
    "ticketId"      TEXT         NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "help_reports_ticketId_key"  ON "help_reports"("ticketId");
CREATE        INDEX IF NOT EXISTS "help_reports_userId_idx"    ON "help_reports"("userId");
CREATE        INDEX IF NOT EXISTS "help_reports_status_idx"    ON "help_reports"("status");

ALTER TABLE "help_reports"
    DROP CONSTRAINT IF EXISTS "help_reports_userId_fkey";

ALTER TABLE "help_reports"
    ADD CONSTRAINT "help_reports_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
