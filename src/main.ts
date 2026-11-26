import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { readAuthSettings, readBffSettings } from './settings'
import type { HttpRequest, HttpResponse } from './auth.schema'

async function main() {
  const settings = readBffSettings(process.env)
  const auth = readAuthSettings(process.env)
  if (process.argv.includes('--check-config')) { console.log('Configuración del BFF válida'); return }
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
  app.enableShutdownHooks()
  app.use('/graphql', (req: HttpRequest, res: HttpResponse, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') { res.status(405).json({ error: 'Solo POST' }); return }
    if (req.headers.origin !== auth.origin || req.headers['x-billetera-request'] !== '1') { res.status(403).json({ error: 'Origen o cabecera de solicitud inválidos' }); return }
    if (typeof req.headers['content-type'] !== 'string' || !req.headers['content-type'].toLowerCase().startsWith('application/json')) { res.status(415).json({ error: 'Se requiere JSON' }); return }
    next()
  })
  app.getHttpAdapter().get('/healthz', (_: unknown, res: HttpResponse) => res.status(200).json({ status: 'ok' }))
  await app.listen(settings.port, '0.0.0.0')
  console.log(`BFF GraphQL escuchando en :${settings.port}`)
}
void main().catch(() => { console.error('No se pudo iniciar el BFF; revisa configuración, contratos y certificados.'); process.exitCode = 1 })
