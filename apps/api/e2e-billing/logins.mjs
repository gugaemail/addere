// Tokens dos SUPERADMINs extras (criados pelo t016prep) e da Maria, renovados
import { login, load, save } from './lib.mjs'
const s = load()
s.saToken = (await login('superadmin@exemplo.test')).accessToken
s.sa2Token = (await login('superadmin2@exemplo.test')).accessToken
s.sa3Token = (await login('superadmin3@exemplo.test')).accessToken
s.mariaToken = (await login('maria@exemplo.test')).accessToken
s.joaoToken = (await login('joao@exemplo.test')).accessToken
save(s)
console.log('tokens renovados')
