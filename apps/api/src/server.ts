import 'dotenv/config'
import { env } from './lib/env'
import { buildApp } from './app'

async function start() {
  const app = await buildApp()
  const port = Number(env.PORT)

  try {
    await app.listen({ port, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
