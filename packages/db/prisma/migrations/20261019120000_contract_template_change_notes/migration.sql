-- Nota da versão dos modelos v1: descreve a versão, sem citar a origem da
-- minuta. Só mexe no rascunho v1 que ainda tem a nota gravada pela migration
-- 20261016104049 — nota editada no painel fica como está.

UPDATE "billing_contract_templates"
SET "changeNote" = 'Primeira versão do Contrato de Licença de Uso do Addere: quadro-resumo, licenças por pacote, cobrança pós-paga e aceite eletrônico.',
    "updatedAt" = NOW()
WHERE "kind" = 'CONTRACT'
  AND "version" = 1
  AND "status" = 'DRAFT'
  AND "changeNote" LIKE '1.1-minuta (15/10/2026): adaptad% da minuta 1.6 do BaiaCerta%';

UPDATE "billing_contract_templates"
SET "changeNote" = 'Primeira versão do termo aditivo: mudança do quadro-resumo, com o antes e o depois, aceita eletronicamente pelo administrador indicado.',
    "updatedAt" = NOW()
WHERE "kind" = 'AMENDMENT'
  AND "version" = 1
  AND "status" = 'DRAFT'
  AND "changeNote" = '1.1-minuta (15/10/2026): modelo de aditivo, com o administrador indicado';
