// Mensagens ao cliente (E7): gera via agente quando disponível; SEMPRE tem
// fallback determinístico (3 templates PT — E0-8 refina). Prefixo /intel/app
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import type { SignalsSnapshot, IntelligenceConfig } from '@addere/types'
import { DEFAULT_INTELLIGENCE_CONFIG, isCustomerBlocked } from '@addere/types'
import { authenticate } from '../../../middleware/authenticate'
import { requireCompany } from '../../../middleware/require-company'
import { requireVendorCode } from '../../../middleware/require-vendor-code'
import { userRateLimit } from '../../../lib/rate-limit'
import { generateWithGuardrails } from '../agent/agent.service'
import {
  buildCustomerFacts,
  customerNumbers,
  customerProducts,
  type MessageFacts,
} from '../agent/facts'
import { customerFacingViolations } from '../agent/self-check'
import { Pseudonymizer } from '../agent/pseudonymizer'
import { loadSnapshot } from '../agent/snapshot'
import { buildTenantContext, systemBlocks } from '../agent/tenant-context'
import { buildMessagePrompt, MESSAGE_SCHEMA, type MessageOutput } from '../agent/prompts/message'

const createSchema = z.object({
  customerCode: z.string().min(1).max(20),
  loja: z.string().min(1).max(10),
  template: z.enum(['STALLED_PROPOSAL', 'WENT_QUIET', 'REACTIVATE']),
})

// O app até a versão de 09/10/2026 manda o corpo vazio: sem o default, toda
// marcação de envio voltava 400 e a fila do app a descartava (sentAt nunca
// gravado). Botão WhatsApp é o único que marcava envio nessas versões.
const sentSchema = z.object({ channel: z.enum(['whatsapp', 'copy']).default('whatsapp') })

export const BLOCKED_MESSAGE = 'Cliente bloqueado — resolva a pendência antes de ofertar'

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
        select: { name: true, municipio: true, msblql: true },
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

      // Snapshot completo, com os títulos em aberto de verdade (fonte única)
      const snapshot = await loadSnapshot(companyId, body.customerCode, body.loja)

      // Bloqueado não recebe oferta — nem do modelo, nem do molde do motor.
      // O self-check só protegia o texto do modelo; o fallback mandava
      // "Posso montar o pedido" pelo WhatsApp. Mesma regra do pedido (plano 010):
      // aparece, mas não vende. msblql é o dado vivo; o status vem do noturno.
      if (isCustomerBlocked(customer.msblql) || snapshot?.status === 'BLOCKED') {
        return reply.status(422).send({ code: 'CUSTOMER_BLOCKED', message: BLOCKED_MESSAGE })
      }

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
            customers: facts.customers.map((c) => ({
              pseudonym: c.pseudonym,
              status: c.status,
              numbers: customerNumbers(c),
            })),
            numbers: [],
            freshnessLine: null,
            products: facts.customers.flatMap(customerProducts),
          },
          // Vai para o cliente: tamanho, pergunta no fim, nada de rótulo interno
          validate: (data) => customerFacingViolations(data.text),
          extractText: (data) => data.text,
        })
        if (result.data) {
          // Reidrata: o único pseudônimo desta requisição é C1 (o próprio cliente)
          text = pseudonymizer.rehydrateStrict(
            result.data.text,
            new Map([[`${body.customerCode}|${body.loja}`, customer.name]])
          )
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
