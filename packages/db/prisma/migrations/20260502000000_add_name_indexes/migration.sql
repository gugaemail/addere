-- Índices compostos para buscas por nome dentro de uma empresa.
-- Reduzem full scans em listProducts/listCustomers com filtro ILIKE ao limitar
-- o conjunto varrido pelo índice [companyId, active] a apenas a empresa correta.

CREATE INDEX "customers_companyId_name_idx" ON "customers"("companyId", "name");
CREATE INDEX "products_companyId_name_idx" ON "products"("companyId", "name");
