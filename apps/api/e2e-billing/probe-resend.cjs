const { createRequire } = require('node:module')
const req = createRequire(require('node:path').join(__dirname, '..', 'package.json'))
const { Resend } = req('resend')
;(async () => {
  const r = new Resend('re_fake_e2e')
  const out = await r.emails.send({ from: 'Addere <noreply@addere.com.br>', to: ['probe@exemplo.test'], subject: 'probe', html: '<p>probe</p>' }, { idempotencyKey: 'probe-1' })
  console.log(JSON.stringify(out))
})()
