-- Sync incremental (plano 009): a marca d'água de cada contrato por empresa — o
-- maior S_T_A_M_P_ que o Protheus devolveu, em texto canônico e sem fuso (é o
-- datetime do SQL Server do cliente, não o relógio do Addere).
-- Tabela nova e vazia: sem linha, o contrato roda a carga completa e cria a sua.
-- Consultas sem {{DESDE}} nunca gravam aqui, então nada muda para elas.
CREATE TABLE "intel_sync_cursors" (
    "companyId" TEXT NOT NULL,
    "name" "IntelQueryName" NOT NULL,
    "stamp" TEXT NOT NULL,
    "lastFullAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intel_sync_cursors_pkey" PRIMARY KEY ("companyId","name")
);

ALTER TABLE "intel_sync_cursors" ADD CONSTRAINT "intel_sync_cursors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
