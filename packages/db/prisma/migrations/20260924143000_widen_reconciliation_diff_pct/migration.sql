-- O percentual da reconciliação cabia só até 9999,99% (DECIMAL(6,2)).
-- Quando o número oficial digitado está errado por ordem de grandeza — o caso
-- de "títulos em aberto", com o saldo do Protheus muito acima do valor do
-- relatório informado —, o UPDATE estourava com "numeric field overflow" e a
-- tela recebia 500 em vez de mostrar a diferença.
-- Alargar é reversível na prática: nenhum valor existente deixa de caber.
ALTER TABLE "intel_queries"
  ALTER COLUMN "reconciliationDiffPct" TYPE DECIMAL(12,2);
