import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { authenticate } from '../../middleware/authenticate'
import { ALLOWED_EXTENSIONS, createReportSchema, listReportsQuerySchema } from './help.schema'
import { createHelpReport, listUserReports } from './help.service'

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'

export default async function helpRoutes(app: FastifyInstance) {
  // POST /help/report — envia reporte de problema com screenshot opcional
  app.post('/report', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.sub

    // ticketId gerado antes do upload para nomear o arquivo de forma consistente
    const ticketId = randomUUID()

    const fields: Record<string, string> = {}
    let screenshotDiskPath: string | undefined
    let screenshotUrl: string | undefined

    try {
      const parts = request.parts()

      for await (const part of parts) {
        if (part.type === 'file') {
          // Ignora campos de arquivo que não sejam "screenshot" ou sem nome
          if (part.fieldname !== 'screenshot' || !part.filename) {
            await part.toBuffer()
            continue
          }

          const ext = path.extname(part.filename).slice(1).toLowerCase()
          if (!ALLOWED_EXTENSIONS.has(ext)) {
            await part.toBuffer()
            return reply.status(400).send({
              error: `Extensão não permitida. Use: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
            })
          }

          const dir = path.resolve(process.cwd(), UPLOAD_DIR, 'help-reports', userId)
          fs.mkdirSync(dir, { recursive: true })

          const filename = `${ticketId}.${ext}`
          screenshotDiskPath = path.join(dir, filename)
          screenshotUrl = `/uploads/help-reports/${userId}/${filename}`

          const buffer = await part.toBuffer()
          fs.writeFileSync(screenshotDiskPath, buffer)
        } else {
          fields[part.fieldname] = part.value as string
        }
      }
    } catch (err: unknown) {
      const httpErr = err as { statusCode?: number }
      if (httpErr.statusCode === 413) {
        return reply.status(413).send({ error: 'Arquivo muito grande. Máximo: 5MB.' })
      }
      throw err
    }

    const result = createReportSchema.safeParse(fields)
    if (!result.success) {
      if (screenshotDiskPath) fs.rmSync(screenshotDiskPath, { force: true })
      const msg = result.error.errors[0]?.message ?? 'Dados inválidos'
      return reply.status(400).send({ error: msg })
    }

    try {
      const report = await createHelpReport(userId, result.data, screenshotUrl, ticketId)
      return reply.status(201).send({
        ticket_id: report.ticketId,
        status: report.status,
        created_at: report.createdAt.toISOString(),
        message: 'Reporte recebido. Nossa equipe vai analisar em até 24h.',
      })
    } catch (err) {
      if (screenshotDiskPath) fs.rmSync(screenshotDiskPath, { force: true })
      request.log.error(err, 'Erro ao criar help report')
      return reply.status(500).send({ error: 'Erro interno. Tente novamente.' })
    }
  })

  // GET /help/reports — lista reportes do usuário autenticado
  app.get('/reports', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.sub

    const queryResult = listReportsQuerySchema.safeParse(request.query)
    if (!queryResult.success) {
      return reply.status(400).send({ error: 'Parâmetros inválidos' })
    }

    const { limit, status } = queryResult.data

    try {
      const data = await listUserReports(userId, limit, status)
      return reply.send(data)
    } catch (err) {
      request.log.error(err, 'Erro ao listar help reports')
      return reply.status(500).send({ error: 'Erro interno. Tente novamente.' })
    }
  })
}
