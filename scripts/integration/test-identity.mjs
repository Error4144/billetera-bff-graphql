import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { GraphClient, cleanup, origin } from './identity-test-utils.mjs'

const ids = []
const password = 'Una contraseña de integración con espacios'
const prefix = randomUUID()
const registration = 'mutation($email:String!,$password:String!,$displayName:String!){registerUser(email:$email,password:$password,displayName:$displayName){profile{id email displayName version} preferences{currency timeZone microExpenseMaximumAmount microExpenseMinimumCount version}}}'
const login = 'mutation($email:String!,$password:String!){login(email:$email,password:$password){profile{id displayName} preferences{version}}}'
const read = '{viewer{id displayName version} userPreferences{currency timeZone microExpenseMaximumAmount microExpenseMinimumCount version}}'
function success(result) { assert.equal(result.status, 200); assert.ok(result.body.data && !result.body.errors, 'respuesta GraphQL exitosa esperada'); return result.body.data }
function error(result, code) { assert.equal(result.body.errors?.[0]?.extensions?.code, code) }
try {
  const a = new GraphClient(), b = new GraphClient()
  assert.equal(success(await a.request(read)).viewer, null)
  const accountA = success(await a.request(registration, { email: `api-a-${prefix}@example.test`, password, displayName: 'Persona A' })).registerUser
  ids.push(accountA.profile.id)
  const accountB = success(await b.request(registration, { email: `api-b-${prefix}@example.test`, password, displayName: 'Persona B' })).registerUser
  ids.push(accountB.profile.id)
  assert.equal(accountA.preferences.microExpenseMaximumAmount, '3000')
  assert.equal(a.cookie, '', 'registro no debe iniciar sesión')
  error(await a.request(registration, { email: `api-a-${prefix}@example.test`, password, displayName: 'Duplicado' }), 'CONFLICT')
  error(await a.request(login, { email: `api-a-${prefix}@example.test`, password: 'Contraseña equivocada de prueba' }), 'UNAUTHENTICATED')
  const logged = await a.request(login, { email: `api-a-${prefix}@example.test`, password })
  assert.equal(success(logged).login.profile.id, accountA.profile.id)
  assert.ok(logged.cookies.every(cookie => cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax')))
  assert.ok(logged.headers.get('cache-control').includes('no-store'))
  assert.ok(!JSON.stringify(logged.body.data).includes('sessionToken'))
  success(await b.request(login, { email: `api-b-${prefix}@example.test`, password }))
  const saved = a.cookie
  assert.equal(success(await a.request(read)).viewer.id, accountA.profile.id)
  assert.equal(success(await b.request(read)).viewer.id, accountB.profile.id)
  success(await a.request('mutation{updateUserProfile(displayName:"Nombre actualizado",expectedVersion:"1"){displayName version}}'))
  error(await a.request('mutation{updateUserProfile(displayName:"Antiguo",expectedVersion:"1"){version}}'), 'CONFLICT')
  success(await a.request('mutation{updateUserPreferences(currency:"CLP",timeZone:"UTC",microExpenseMaximumAmount:"9007199254740993",microExpenseMinimumCount:4,expectedVersion:"1"){version}}'))
  const updated = success(await a.request(read))
  assert.equal(updated.viewer.displayName, 'Nombre actualizado')
  assert.equal(updated.userPreferences.microExpenseMaximumAmount, '9007199254740993')
  assert.equal(updated.userPreferences.timeZone, 'UTC')
  assert.equal(success(await b.request(read)).userPreferences.microExpenseMaximumAmount, '3000')
  error(await a.request('mutation{updateUserPreferences(currency:"CLP",timeZone:"UTC",microExpenseMaximumAmount:"9223372036854775808",microExpenseMinimumCount:4,expectedVersion:"2"){version}}'), 'BAD_USER_INPUT')
  assert.equal((await a.request(read, {}, { origin: 'https://ajeno.example' })).status, 403)
  assert.equal((await a.request(read, {}, { omitOrigin: true })).status, 403)
  assert.equal((await a.request(read, {}, { omitHeader: true })).status, 403)
  assert.equal((await fetch(origin + '/graphql')).status, 405)
  success(await a.request('mutation{logout}'))
  assert.equal(success(await a.request(read, {}, { cookie: saved })).viewer, null, 'cookie anterior debe estar revocada')
  error(await a.request('mutation{updateUserProfile(displayName:"No permitido",expectedVersion:"2"){version}}', {}, { cookie: saved }), 'UNAUTHENTICATED')
  success(await a.request('mutation{logout}'))
  assert.equal(success(await b.request(read)).viewer.id, accountB.profile.id, 'logout de A no afecta a B')
  console.log('Integración HTTP aprobada: registro, login, perfil, preferencias exactas, aislamiento, conflictos, CSRF y logout efectivo.')
} finally { cleanup(ids) }
