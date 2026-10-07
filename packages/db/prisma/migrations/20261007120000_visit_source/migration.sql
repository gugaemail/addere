-- O pedido passa a valer como check-in (plano 006): a visita implícita nasce do
-- pedido, sem GPS e sem duração. A origem fica registrada para que a ausência
-- desses dados seja explicável — tratar as duas como equivalentes é a regra de
-- negócio, mas não saber qual foi qual torna impossível explicar a diferença.
-- O default preserva todas as linhas que já existem.
CREATE TYPE "VisitSource" AS ENUM ('CHECKIN', 'ORDER');

ALTER TABLE "intel_visits"
  ADD COLUMN "source" "VisitSource" NOT NULL DEFAULT 'CHECKIN';
