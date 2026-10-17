import { prisma } from '@addere/db'
import type { BillingDashboardDto } from '@addere/types'
import { ymdSaoPaulo } from '../intelligence/engine/business-days'
import { usedSeatsByCompany } from './clients.service'
import { buildBillingDashboard, revenueWindowStart } from './dashboard'

// Painel da Gestão Addere (plano 018): cinco consultas em Promise.all, como o
// getOrderStats, e a agregação pura de dashboard.ts.
//
// Em memória porque o Prisma não agrupa por mês de uma data sem SQL cru, e o
// volume é pequeno (uma fatura por empresa por mês). Os select aninhados da
// consulta de empresas viram uma leitura por relação, em lote (IN), não uma
// por empresa. Sem $transaction: o painel não precisa de foto consistente
// entre as tabelas; uma baixa no meio da requisição aparece no próximo
// carregamento.

export async function getBillingDashboard(now: Date = new Date()): Promise<BillingDashboardDto> {
  // Dia 1 do mês mais antigo do gráfico. paidAt e competence são @db.Date:
  // o recorte é por dia civil, sem folga de fuso; o fino é em memória.
  const windowStart = revenueWindowStart(ymdSaoPaulo(now))

  const [companies, invoices, documents, licenseRequests, usedSeats] = await Promise.all([
    // 1. Todas as empresas, com o bloqueio do 017 e o contrato com os termos
    // EFFECTIVE. Os termos atuais são escolhidos em memória pelo
    // resolveCurrentTerms do 013, nunca por orderBy + take aqui.
    prisma.company.findMany({
      select: {
        id: true,
        name: true,
        active: true,
        accessBlockedAt: true,
        accessBlockReason: true,
        contract: {
          select: {
            status: true,
            graceMonths: true,
            firstBilledCompetence: true,
            terms: {
              where: { status: 'EFFECTIVE' },
              select: {
                version: true,
                status: true,
                effectiveFrom: true,
                includedSeats: true,
                extraSeats: true,
                packagePrice: true,
                extraSeatPrice: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    // 2. Faturas não canceladas: as em aberto (qualquer data) e as da janela de
    // 12 meses, por competência ou pela baixa
    prisma.invoice.findMany({
      where: {
        status: { not: 'CANCELLED' },
        OR: [
          { status: 'OPEN' },
          { competence: { gte: windowStart } },
          { paidAt: { gte: windowStart } },
        ],
      },
      select: {
        id: true,
        number: true,
        companyId: true,
        competence: true,
        dueDate: true,
        status: true,
        total: true,
        paidAt: true,
        paidAmount: true,
      },
    }),
    // 3. Documentos enviados e ainda sem aceite (contrato e aditivo)
    prisma.contractDocument.findMany({
      where: { status: 'SENT' },
      select: { id: true, companyId: true, kind: true, status: true, sentAt: true },
    }),
    // 4. Pedidos de licenças pendentes
    prisma.licenseRequest.findMany({
      where: { status: 'PENDING' },
      select: { id: true, companyId: true, quantity: true, status: true, createdAt: true },
    }),
    // 5. Licenças usadas: o mesmo groupBy da lista de Clientes
    usedSeatsByCompany(),
  ])

  return buildBillingDashboard({ companies, invoices, documents, licenseRequests, usedSeats }, now)
}
