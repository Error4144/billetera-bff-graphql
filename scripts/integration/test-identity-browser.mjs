import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { GraphClient, cleanup, origin, workspace } from './identity-test-utils.mjs'

const require = createRequire(import.meta.url)
let playwright
try {
  const frontendRequire = createRequire(resolve(workspace, 'billetera-frontend/package.json'))
  playwright = frontendRequire('playwright')
} catch {
  playwright = require(resolve(workspace, '.tools/playwright-core/package'))
}
const { chromium } = playwright
const ids = []
const errors = []
const browser = await chromium.launch({ channel: process.env.IDENTITY_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  await page.getByRole('heading', { name: 'Iniciar sesión', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Registrarme', exact: true }).click()
  const email = `browser-${randomUUID()}@example.test`
  const password = 'Una frase larga de prueba para navegador'
  await page.getByLabel('Nombre', { exact: true }).fill('Prueba de integración')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  const registration = page.waitForResponse(response => response.url().endsWith('/graphql') && response.request().postData()?.includes('mutation Register'))
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  const response = await registration
  const data = await response.json()
  assert.ok(data.data?.registerUser?.profile?.id, 'registro UI debe persistir usuario')
  ids.push(data.data.registerUser.profile.id)
  await page.getByText('Cuenta creada. Inicia sesión para continuar.', { exact: true }).waitFor()
  await page.getByLabel('Contraseña').fill('Contraseña incorrecta suficientemente larga')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Credenciales incorrectas' }).waitFor()
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.getByRole('heading', { name: 'Mi cuenta', exact: true }).waitFor()
  const cookie = (await context.cookies(origin)).find(item => item.name === 'billetera_session')
  assert.ok(cookie?.httpOnly && cookie.sameSite === 'Lax', 'cookie de sesión debe ser HttpOnly')
  assert.ok(!(await page.evaluate(() => document.cookie)).includes('billetera_session'), 'JavaScript no debe leer la cookie')
  const oldCookie = cookie.name + '=' + cookie.value
  await page.getByLabel('Nombre del perfil').fill('Perfil actualizado desde la interfaz')
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click()
  await page.getByText('Perfil guardado.', { exact: true }).waitFor()
  await page.getByLabel('Zona horaria').fill('UTC')
  await page.getByLabel('Monto máximo de gastos hormiga (CLP)').fill('7000')
  await page.getByLabel('Frecuencia mínima mensual').fill('5')
  await page.getByRole('button', { name: 'Guardar preferencias', exact: true }).click()
  await page.getByText('Preferencias guardadas.', { exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: 'Mi cuenta', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Nombre del perfil').inputValue(), 'Perfil actualizado desde la interfaz')
  assert.equal(await page.getByLabel('Zona horaria').inputValue(), 'UTC')
  assert.equal(await page.getByLabel('Monto máximo de gastos hormiga (CLP)').inputValue(), '7000')
  assert.equal(await page.getByLabel('Frecuencia mínima mensual').inputValue(), '5')
  const artifacts = resolve(workspace, 'test-artifacts')
  await mkdir(artifacts, { recursive: true })
  await page.screenshot({ path: resolve(artifacts, 'identity-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'pantalla móvil desbordada')
  await page.screenshot({ path: resolve(artifacts, 'identity-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await page.getByRole('heading', { name: 'Iniciar sesión', exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: 'Iniciar sesión', exact: true }).waitFor()
  const client = new GraphClient()
  const revoked = await client.request('{viewer{id}}', {}, { cookie: oldCookie })
  assert.equal(revoked.body.data?.viewer, null, 'el token anterior debe estar revocado en el servidor')
  assert.equal(errors.length, 0, 'errores de JavaScript en la interfaz')
  console.log('Navegador aprobado: registro, login incorrecto/correcto, perfil y preferencias persistidos, cookie HttpOnly, móvil y logout efectivo.')
} finally { await browser.close(); cleanup(ids) }
