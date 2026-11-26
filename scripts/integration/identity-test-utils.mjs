import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const workspace = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
export const origin = 'http://127.0.0.1:8080'
export function cleanup(ids) {
  if (!ids.length) return
  if (!ids.every(id => /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(id))) throw new Error('ID de fixture inválido; limpieza cancelada')
  const values = Object.fromEntries(readFileSync(resolve(workspace, 'billetera-ms-usuarios/.env'), 'utf8').split(/\r?\n/).map(line => { const index = line.indexOf('='); return index < 0 ? ['', ''] : [line.slice(0, index), line.slice(index + 1)] }))
  const list = ids.map(id => `'${id}'::uuid`).join(',')
  const sql = `BEGIN;
DELETE FROM limites_login WHERE correo_hash IN (SELECT sha256(convert_to(email,'UTF8')) FROM usuarios WHERE id IN (${list}));
DELETE FROM sesiones WHERE usuario_id IN (${list});
DELETE FROM outbox_eventos WHERE usuario_id IN (${list});
DELETE FROM preferencias_usuario WHERE usuario_id IN (${list});
DELETE FROM usuarios WHERE id IN (${list});
COMMIT;`
  execFileSync('docker', ['--context', 'desktop-linux', 'compose', '-f', resolve(workspace, 'billetera-ms-usuarios/compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '-X', '-U', values.POSTGRES_USER, '-d', values.POSTGRES_DB, '-v', 'ON_ERROR_STOP=1'], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] })
}

export class GraphClient {
  cookie = ''
  async request(query, variables = {}, options = {}) {
    const headers = { 'content-type': 'application/json', origin, 'x-billetera-request': '1' }
    if (options.origin !== undefined) headers.origin = options.origin
    if (options.omitOrigin) delete headers.origin
    if (options.omitHeader) delete headers['x-billetera-request']
    const cookie = options.cookie ?? this.cookie
    if (cookie) headers.cookie = cookie
    const response = await fetch(origin + '/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables }), redirect: 'error' })
    const cookies = response.headers.getSetCookie()
    if (cookies.length && options.cookie === undefined) this.cookie = cookies.at(-1).split(';')[0]
    return { status: response.status, body: await response.json(), cookies, headers: response.headers }
  }
}
