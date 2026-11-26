const { test } = require('node:test')
const assert = require('node:assert/strict')
const { GraphQLError } = require('graphql')
const { status } = require('@grpc/grpc-js')
const { createResolvers, cookieToken, decimal } = require('../dist/auth.schema')
const { graphError } = require('../dist/users.gateway')
const { readAuthSettings } = require('../dist/settings')

test('login entrega token solo por cookie HttpOnly y no por GraphQL', async () => {
  const stamp = { seconds: '1795690800', nanos: 0 }
  const token = 'A'.repeat(43)
  const gateway = { auth: { cookieName: '__Host-billetera_session', secure: true }, async call(method) {
    if (method === 'login') return { sessionToken: token, session: { expiresAt: stamp } }
    if (method === 'getProfile') return { id: 'id', email: 'a@example.test', displayName: 'Nombre', version: '1', createdAt: stamp, updatedAt: stamp }
    if (method === 'getPreferences') return { currency: 'CLP', version: '1', updatedAt: stamp }
    throw new Error('operación inesperada')
  } }
  const headers = {}
  const ctx = { req: { headers: {} }, res: { setHeader(name, value) { headers[name] = value } } }
  const result = await createResolvers(gateway).Mutation.login(null, {}, ctx)
  assert.ok(!JSON.stringify(result).includes(token))
  assert.ok(headers['Set-Cookie'].includes('HttpOnly') && headers['Set-Cookie'].includes('Secure'))
  assert.equal(headers['Cache-Control'], 'no-store')
})

test('sesión revocada limpia cookie y bloquea escrituras; cookies duplicadas no seleccionan identidad', async () => {
  const gateway = { auth: { cookieName: 'billetera_session', secure: false }, async call() { throw new GraphQLError('expirada', { extensions: { code: 'UNAUTHENTICATED' } }) } }
  const headers = {}
  const ctx = { req: { headers: { cookie: 'billetera_session=' + 'A'.repeat(43) } }, res: { setHeader(name, value) { headers[name] = value } } }
  const resolvers = createResolvers(gateway)
  assert.equal(await resolvers.Query.viewer(null, {}, ctx), null)
  assert.ok(headers['Set-Cookie'].includes('Max-Age=0'))
  await assert.rejects(() => resolvers.Mutation.updateUserProfile(null, { displayName: 'Nombre', expectedVersion: '1' }, ctx), error => error.extensions.code === 'UNAUTHENTICATED')
  assert.equal(cookieToken('billetera_session=' + 'A'.repeat(43) + '; billetera_session=' + 'B'.repeat(43), 'billetera_session'), undefined)
})

test('preserva int64 y no transmite detalles de errores internos', () => {
  assert.equal(decimal('9007199254740993'), '9007199254740993')
  assert.throws(() => decimal('9223372036854775808'))
  assert.throws(() => decimal('1.5'))
  const error = graphError({ code: status.INTERNAL, details: 'SQL password=privada' })
  assert.ok(!error.message.includes('privada'))
  assert.equal(error.extensions.code, 'INTERNAL_SERVER_ERROR')
})

test('cookies sin Secure se restringen a desarrollo HTTP en loopback', () => {
  const env = { GRPC_USUARIOS_TLS_CA_FILE: 'ca', GRPC_USUARIOS_TLS_CERT_FILE: 'cert', GRPC_USUARIOS_TLS_KEY_FILE: 'key', BFF_PUBLIC_ORIGIN: 'http://127.0.0.1:8080', SESSION_COOKIE_SECURE: 'false' }
  assert.equal(readAuthSettings(env).cookieName, 'billetera_session')
  assert.throws(() => readAuthSettings({ ...env, BFF_PUBLIC_ORIGIN: 'http://example.com' }))
})
