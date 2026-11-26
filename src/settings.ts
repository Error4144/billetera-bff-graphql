export function readBffSettings(env: NodeJS.ProcessEnv) {
  const input = env.BFF_PORT ?? '3000'
  const port = Number(input)
  if (!/^[1-9]\d{0,4}$/.test(input) || port > 65535) throw new Error('BFF_PORT inválido')
  const grpc: Record<string, string> = {}
  for (const name of ['USUARIOS', 'TRANSACCIONES', 'NOTIFICACIONES', 'AGENTE']) {
    const value = env[`GRPC_${name}_ADDRESS`]?.trim() ?? ''
    const match = /^[a-z\d.-]+:([1-9]\d{0,4})$/i.exec(value)
    if (!match || Number(match[1]) > 65535) throw new Error(`GRPC_${name}_ADDRESS inválido`)
    grpc[name.toLowerCase()] = value
  }
  return { port, grpc }
}

export function readAuthSettings(env: NodeJS.ProcessEnv) {
  const origin = new URL(env.BFF_PUBLIC_ORIGIN ?? 'https://localhost')
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('BFF_PUBLIC_ORIGIN inválido')
  const secureInput = env.SESSION_COOKIE_SECURE ?? 'true'
  if (!['true', 'false'].includes(secureInput)) throw new Error('SESSION_COOKIE_SECURE inválido')
  const secure = secureInput === 'true'
  if ((!secure || origin.protocol !== 'https:') && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname) && !secure)) throw new Error('Cookies sin Secure solo se permiten en HTTP local')
  const required = (key: string) => { const value = env[key]?.trim(); if (!value) throw new Error(`Falta ${key}`); return value }
  return { origin: origin.origin, secure, cookieName: secure ? '__Host-billetera_session' : 'billetera_session',
    ca: required('GRPC_USUARIOS_TLS_CA_FILE'), cert: required('GRPC_USUARIOS_TLS_CERT_FILE'), key: required('GRPC_USUARIOS_TLS_KEY_FILE') }
}
