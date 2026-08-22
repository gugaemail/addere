// Mensagens ao cliente (E7): gera via agente quando disponível; SEMPRE tem
// fallback determinístico (3 templates PT — E0-8 refina). Prefixo /intel/app
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import type { SignalsSnapshot, IntelligenceConfig } from '@addere/types'
import { DEFAULT_INTELLIGENCE_CONFIG } from '@addere/types'
import { authenticate } from '../../../middleware/authenticate'
import { requireCompany } from '../../../middleware/require-company'
import { requireVendorCode } from '../../../middleware/require-vendor-code'
import { userRateLimit } from '../../../lib/rate-limit'
import { generateWithGuardrails } from '../agent/agent.service'
import { buildCustomerFacts, type MessageFacts } from '../agent/facts'
import { Pseudonymizer } from '../agent/pseudonymizer'
import { buildTenantContext, systemBlocks } from '../agent/tenant-context'
import { buildMessagePrompt, MESSAGE_SCHEMA, type MessageOutput } from '../agent/prompts/message'

const createSchema = z.object({
  customerCode: z.string().min(1).max(20),
  loja: z.string().min(1).max(10),
  template: z.enum(['STALLED_PROPOSAL', 'WENT_QUIET', 'REACTIVATE']),
})

const sentSchema = z.object({ channel: z.enum(['whatsapp', 'copy']) })

/** Fallback determinístico — funciona sem LLM (só-motor). */
export function fallbackMessage(
  template: 'STALLED_PROPOSAL' | 'WENT_QUIET' | 'REACTIVATE',
  name: string,
  snapshot: SignalsSnapshot | null,
  tone: 'informal' | 'formal'
): string {
  const hi = tone === 'formal' ? `Olá, ${name}` : `Oi, ${name}`
  const days = snapshot?.daysSinceLastPurchase
  const cycle = snapshot?.cycleDays
  switch (template) {
    case 'STALLED_PROPOSAL':
      return `${hi}! Sobre a proposta que conversamos: ficou alguma dúvida de preço ou prazo? Consigo ajustar por aqui mesmo. Fechamos essa semana?`
    case 'WENT_QUIET':
      return `${hi}! ${days ? `Sua última compra foi há ${days} dias` : 'Faz um tempo desde seu último pedido'}${cycle ? ` — normalmente você repõe a cada ${cycle} dias` : ''}. Precisa repor algo? Posso montar o pedido. Que dia fica bom?`
    case 'REACTIVATE':
      return `${hi}! Aqui é da equipe comercial — sentimos sua falta por aqui. Temos novidades no mix que costumava levar. Posso passar aí essa semana para retomarmos?`
  }
}

export default async function messagesRoutes(app: FastifyInstance) {
  const guard = [authenticate, requireCompany, requireVendorCode]

  // POST /intel/app/messages — gera e registra a mensagem
  app.post(
    '/messages',
    { preHandler: [...guard, userRateLimit(10, '1 minute')] },
    async (request, reply) => {
      const body = createSchema.parse(request.body)
      const companyId = request.user.companyId as string
      const vendorCode = request.vendorCode as string

      const customer = await prisma.customer.findFirst({
        where: {
          companyId,
          vendorCode,
          protheusCode: body.customerCode,
          loja: body.loja,
          active: true,
        },
        select: { name: true, municipio: true },
      })
      if (!customer) return reply.status(404).send({ message: 'Cliente não encontrado' })

      const company = await prisma.company.findUnique({ where: { id: companyId } })
      const config: IntelligenceConfig = {
        ...DEFAULT_INTELLIGENCE_CONFIG,
        ...((company?.intelligenceConfig ?? {}) as Partial<IntelligenceConfig>),
      }
      const seller = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { messageTone: true },
      })
      const tone = (seller?.messageTone ?? config.defaultTone) as 'informal' | 'formal'

      const signal = await prisma.customerSignal.findUnique({
        where: {
          companyId_customerCode_loja: {
            companyId,
            customerCode: body.customerCode,
            loja: body.loja,
          },
        },
      })
      const snapshot: SignalsSnapshot | null = signal
        ? {
            status: signal.status,
            confidence: signal.confidence,
            cycleDays: signal.cycleDays,
            daysSinceLastPurchase: signal.daysSinceLastPurchase,
            orders12m: signal.orders12m,
            avgTicket: signal.avgTicket?.toString() ?? null,
            trendPct: signal.trendPct === null ? null : Number(signal.trendPct),
            usualMix: (signal.usualMix ?? []) as SignalsSnapshot['usualMix'],
            cutMix: (signal.cutMix ?? []) as SignalsSnapshot['cutMix'],
            openTitles: { count: 0, totalBalance: '0.00', maxDaysOverdue: null },
            reasons: (signal.reasons ?? []) as string[],
          }
        : null

      let text: string | null = null
      if (snapshot) {
        const pseudonymizer = new Pseudonymizer()
        const facts: MessageFacts = {
          situation: body.template,
          tone,
          customers: [
            buildCustomerFacts(
              {
                customerCode: body.customerCode,
                loja: body.loja,
                city: customer.municipio,
                snapshot,
              },
              pseudonymizer
            ),
          ],
          lastOrderDays: snapshot.daysSinceLastPurchase,
          freshness: { lastSyncAt: null },
        }
        const result = await generateWithGuardrails<MessageOutput>({
          companyId,
          kind: 'message',
          vendorCode,
          targetKey: `${body.customerCode}:${body.loja}:${body.template}`,
          system: systemBlocks(company ? await buildTenantContext(company) : ''),
          userPrompt: buildMessagePrompt(facts),
          schema: MESSAGE_SCHEMA as unknown as Record<string, unknown>,
          factsPayload: facts,
          selfCheckFacts: {
            customers: facts.customers.map((c) => ({ pseudonym: c.pseudonym, status: c.status })),
            numbers: [
              snapshot.cycleDays,
              snapshot.daysSinceLastPurchase,
              snapshot.orders12m,
              snapshot.avgTicket === null ? null : Number(snapshot.avgTicket),
            ].filter((n): n is number => n !== null && Number.isFinite(n)),
            freshnessLine: null,
          },
          extractText: (data) => data.text,
        })
        if (result.data) {
          // Reidrata: o único pseudônimo desta requisição é C1 (o próprio cliente)
          text = result.data.text.replace(/\bC1\b/g, customer.name)
        }
      }
      if (!text) text = fallbackMessage(body.template, customer.name, snapshot, tone)

      const message = await prisma.customerMessage.create({
        data: {
          companyId,
          vendorCode,
          customerCode: body.customerCode,
          loja: body.loja,
          template: body.template,
          text,
        },
      })

      return reply.status(201).send({
        id: message.id,
        customerCode: message.customerCode,
        loja: message.loja,
        template: message.template,
        text: message.text,
        generatedAt: message.generatedAt.toISOString(),
        sentAt: null,
      })
    }
  )

  // POST /intel/app/messages/:id/sent — marca envio (posse por vendorCode)
  app.post('/messages/:id/sent', { preHandler: guard }, async (request, reply) => {
    const id = z.string().uuid().parse((request.params as { id: string }).id)
    const body = sentSchema.parse(request.body)
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string

    const message = await prisma.customerMessage.findFirst({
      where: { id, companyId, vendorCode },
    })
    if (!message) return reply.status(404).send({ message: 'Mensagem não encontrada' })

    await prisma.customerMessage.update({
      where: { id },
      data: { sentAt: new Date(), channel: body.channel },
    })
    return reply.send({ ok: true })
  })
}
