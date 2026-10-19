// 016 — desconto, recálculo, baixa diferente do total, PAID imutável, avulsa e cancelamento
import { api, load, save, sql, sqlJson, check, j } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`
const today = sql(`select (now() at time zone 'America/Sao_Paulo')::date::text`)
const plus = (d) => sql(`select ((now() at time zone 'America/Sao_Paulo')::date + ${d})::text`)

// Desconto (item negativo)
const disc = await api('POST', `/admin/billing/invoices/${s.invA}/items`, { token: T, body: { kind: 'DISCOUNT', description: 'Desconto de boas-vindas', amount: '100.10' } })
check('016.desconto', disc.status === 201 && disc.body.total === '1699.90' && disc.body.items.some((i) => i.kind === 'DISCOUNT' && i.amount === '-100.10' && i.manual), `${sc(disc)} total=${disc.body.total} itens=${j(disc.body.items?.map((i) => `${i.kind}:${i.amount}`))}`)
const adj = await api('POST', `/admin/billing/invoices/${s.invA}/items`, { token: T, body: { kind: 'ADJUSTMENT', description: 'Ajuste positivo', amount: '0.20' } })
check('016.ajuste-decimal', adj.status === 201 && adj.body.total === '1700.10', `${sc(adj)} total=${adj.body.total}`)
const neg = await api('POST', `/admin/billing/invoices/${s.invA}/items`, { token: T, body: { kind: 'ADJUSTMENT', description: 'Ajuste que zera demais', amount: '-5000.00' } })
check('016.total-negativo-recusado', neg.status === 422 && neg.body.code === 'INVOICE_NEGATIVE_TOTAL', sc(neg))
const autoItem = disc.body.items.find((i) => !i.manual)
const rmAuto = await api('DELETE', `/admin/billing/invoices/${s.invA}/items/${autoItem.id}`, { token: T })
check('016.remover-automatico-recusado', rmAuto.status === 409 && rmAuto.body.code === 'INVOICE_ITEM_NOT_MANUAL', sc(rmAuto))
// Recálculo mantém os manuais
const rec = await api('POST', `/admin/billing/invoices/${s.invA}/recalculate`, { token: T })
const recItems = sqlJson(`select kind, amount::text a, manual from billing_invoice_items where "invoiceId"='${s.invA}' order by manual, kind`)
check('016.recalculo-mantem-manual', rec.status === 200 && rec.body.total === '1700.10' && recItems.length === 3 && recItems.filter((i) => i.manual).length === 2, `${sc(rec)} total=${rec.body.total} itens=${j(recItems)}`)
// Remover item manual
const adjItem = rec.body.items.find((i) => i.kind === 'ADJUSTMENT')
const rm = await api('DELETE', `/admin/billing/invoices/${s.invA}/items/${adjItem.id}`, { token: T })
check('016.remover-manual', rm.status === 200 && rm.body.total === '1699.90', `${sc(rm)} total=${rm.body.total}`)

// Baixa com valor diferente do total
const futurePay = await api('POST', `/admin/billing/invoices/${s.invA}/pay`, { token: T, body: { paidAt: plus(1), amount: '1699.90', method: 'PIX' } })
check('016.baixa-data-futura-recusada', futurePay.status === 422 && futurePay.body.code === 'PAID_AT_IN_FUTURE', sc(futurePay))
const pay = await api('POST', `/admin/billing/invoices/${s.invA}/pay`, { token: T, body: { paidAt: today, amount: '1650.00', method: 'PIX', note: 'Pagou com abatimento combinado' } })
const paidRow = sqlJson(`select status, "paidAt"::text pa, "paidAmount"::text amt, total::text total, "paidByName" from billing_invoices where id='${s.invA}'`)[0]
check('016.baixa-valor-diferente', pay.status === 200 && paidRow.status === 'PAID' && paidRow.amt === '1650.00' && paidRow.total === '1699.90' && paidRow.pa === today, `${sc(pay)} ${j(paidRow)}`)
const pay2 = await api('POST', `/admin/billing/invoices/${s.invA}/pay`, { token: T, body: { paidAt: today, amount: '1650.00', method: 'PIX' } })
const addPaid = await api('POST', `/admin/billing/invoices/${s.invA}/items`, { token: T, body: { kind: 'DISCOUNT', description: 'Depois de paga', amount: '1.00' } })
const recPaid = await api('POST', `/admin/billing/invoices/${s.invA}/recalculate`, { token: T })
const canPaid = await api('POST', `/admin/billing/invoices/${s.invA}/cancel`, { token: T, body: { reason: 'Tentativa' } })
const rmPaid = await api('DELETE', `/admin/billing/invoices/${s.invA}/items/${disc.body.items.find((i) => i.kind === 'DISCOUNT').id}`, { token: T })
const nf = await api('PATCH', `/admin/billing/invoices/${s.invA}`, { token: T, body: { nfNumber: 'NF-2026-0001', notes: 'Observação interna e2e' } })
check('016.paid-imutavel', [pay2, addPaid, recPaid, canPaid, rmPaid].every((r) => r.status === 409 && r.body.code === 'INVOICE_PAID_IMMUTABLE') && nf.status === 200 && nf.body.nfNumber === 'NF-2026-0001' && nf.body.notes === 'Observação interna e2e' && nf.body.total === '1699.90',
  `pagar de novo=${sc(pay2)} item=${sc(addPaid)} recalcular=${sc(recPaid)} cancelar=${sc(canPaid)} remover=${sc(rmPaid)} nf+obs=${sc(nf)} nf=${nf.body.nfNumber}`)

// ADMIN vê a fatura sem campos internos
const my = await api('GET', '/billing/me/invoices', { token: s.mariaToken })
const myA = my.body.find?.((i) => i.id === s.invA)
check('016.admin-ve-sem-internos', my.status === 200 && myA && myA.notes === undefined && myA.paidByName === undefined && myA.nfNumber === 'NF-2026-0001' && myA.displayStatus, `${sc(my)} chaves=${j(Object.keys(myA ?? {}))} status=${myA?.displayStatus}`)

// Fatura avulsa
const cur = sql(`select to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM')`)
const avCur = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: s.companyA, competence: cur, dueDate: plus(5), useContractTerms: true } })
check('016.avulsa-mes-corrente-recusada', avCur.status === 422 && avCur.body.code === 'COMPETENCE_NOT_PAST', sc(avCur))
const avDup = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: s.companyA, competence: '2026-09', dueDate: plus(5), useContractTerms: true } })
check('016.avulsa-competencia-ocupada', avDup.status === 409 && avDup.body.code === 'INVOICE_ALREADY_EXISTS', sc(avDup))
const avNotBillable = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: s.companyA, competence: '2026-08', dueDate: plus(5), useContractTerms: true } })
check('016.avulsa-antes-da-1a-competencia', avNotBillable.status === 422 && avNotBillable.body.code === 'COMPETENCE_NOT_BILLABLE', sc(avNotBillable))
const avPast = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: s.companyA, competence: '2026-08', dueDate: plus(-1), useContractTerms: false, items: [{ kind: 'ADJUSTMENT', description: 'Implantação', amount: '300.00' }] } })
check('016.avulsa-vencimento-passado', avPast.status === 422 && avPast.body.code === 'DUE_DATE_IN_PAST', sc(avPast))
const avA = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: s.companyA, competence: '2026-08', dueDate: plus(20), useContractTerms: false, items: [{ kind: 'ADJUSTMENT', description: 'Implantação', amount: '300.00' }], notes: 'Avulsa de agosto' } })
check('016.avulsa-itens-manuais', avA.status === 201 && avA.body.origin === 'MANUAL' && avA.body.total === '300.00' && avA.body.competence === '2026-08', `${sc(avA)} total=${avA.body.total} comp=${avA.body.competence}`)
// B: agosto pelo contrato, vencendo em 2 dias (para o lembrete)
const avB = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: s.companyB, competence: '2026-08', dueDate: plus(2), useContractTerms: true } })
check('016.avulsa-pelo-contrato', avB.status === 201 && avB.body.total === '3501.00' && avB.body.items.length === 2, `${sc(avB)} total=${avB.body.total} itens=${j(avB.body.items?.map((i) => i.kind))}`)
s.invBAug = avB.body.id
s.invAAug = avA.body.id

// Cancelar fatura OPEN (avulsa de C, agosto)
const avC = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: s.companyC, competence: '2026-08', dueDate: plus(10), useContractTerms: false, items: [{ kind: 'ADJUSTMENT', description: 'Item a cancelar', amount: '50.00' }] } })
const canC = await api('POST', `/admin/billing/invoices/${avC.body.id}/cancel`, { token: T, body: { reason: 'Lançada por engano' } })
const avC2 = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: s.companyC, competence: '2026-08', dueDate: plus(10), useContractTerms: false, items: [{ kind: 'ADJUSTMENT', description: 'Outra', amount: '50.00' }] } })
const addCanc = await api('POST', `/admin/billing/invoices/${avC.body.id}/items`, { token: T, body: { kind: 'ADJUSTMENT', description: 'Depois de cancelada', amount: '1.00' } })
check('016.cancelar-open', avC.status === 201 && canC.status === 200 && canC.body.status === 'CANCELLED' && avC2.status === 409 && addCanc.status === 409 && addCanc.body.code === 'INVOICE_CANCELLED',
  `criar=${sc(avC)} cancelar=${sc(canC)} recriar na competência=${sc(avC2)} item na cancelada=${sc(addCanc)}`)

// Filtros da lista
const lo = await api('GET', '/admin/billing/invoices?status=OVERDUE', { token: T })
const lp = await api('GET', '/admin/billing/invoices?status=PAID', { token: T })
console.log('lista vencidas', lo.body.total, j(lo.body.items.map((i) => `${i.companyName}:${i.competence}:${i.displayStatus}`)), 'pagas', lp.body.total)
save(s)
