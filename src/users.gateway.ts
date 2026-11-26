import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, credentials, loadPackageDefinition, Metadata, status, type ServiceError } from '@grpc/grpc-js'
import { loadSync } from '@grpc/proto-loader'
import { GraphQLError } from 'graphql'
import { readAuthSettings, readBffSettings } from './settings'

export type Timestamp = { seconds: string; nanos: number }
export type Profile = { id: string; email: string; displayName: string; version: string; createdAt: Timestamp; updatedAt: Timestamp }
export type Preferences = { currency: string; timeZone: string; microExpenseMaximumAmount: string; microExpenseMinimumCount: number; version: string; updatedAt: Timestamp }
export type Session = { userId: string; sessionId: string; expiresAt: Timestamp }
type DynamicClient = Client & Record<string, Function>

export function graphError(error: ServiceError): GraphQLError {
  const codes: Record<number, string> = { [status.INVALID_ARGUMENT]: 'BAD_USER_INPUT', [status.ALREADY_EXISTS]: 'CONFLICT', [status.ABORTED]: 'CONFLICT', [status.UNAUTHENTICATED]: 'UNAUTHENTICATED', [status.PERMISSION_DENIED]: 'FORBIDDEN', [status.RESOURCE_EXHAUSTED]: 'RATE_LIMITED', [status.UNAVAILABLE]: 'SERVICE_UNAVAILABLE', [status.DEADLINE_EXCEEDED]: 'SERVICE_UNAVAILABLE' }
  const code = codes[error.code] ?? 'INTERNAL_SERVER_ERROR'
  const messages: Record<string, string> = { BAD_USER_INPUT: 'Revisa los datos ingresados.', CONFLICT: 'El correo ya está registrado o los datos cambiaron. Vuelve a consultarlos.', UNAUTHENTICATED: 'Credenciales incorrectas o sesión vencida.', FORBIDDEN: 'Operación no autorizada.', RATE_LIMITED: 'Demasiados intentos. Intenta más tarde.', SERVICE_UNAVAILABLE: 'Usuarios no está disponible temporalmente.', INTERNAL_SERVER_ERROR: 'No se pudo completar la operación.' }
  return new GraphQLError(messages[code], { extensions: { code } })
}
export function date(timestamp: Timestamp) { return new Date(Number(timestamp.seconds) * 1000 + Math.floor(timestamp.nanos / 1e6)).toISOString() }

@Injectable()
export class UsersGateway implements OnModuleDestroy {
  readonly auth = readAuthSettings(process.env)
  private readonly client: DynamicClient
  constructor() {
    const definition = loadSync(resolve('proto/billetera/usuarios/v1/usuarios.proto'), { longs: String, enums: String, defaults: true, oneofs: true })
    const api = loadPackageDefinition(definition) as unknown as { billetera: { usuarios: { v1: { UsersService: new(address: string, creds: ReturnType<typeof credentials.createSsl>) => DynamicClient } } } }
    this.client = new api.billetera.usuarios.v1.UsersService(readBffSettings(process.env).grpc.usuarios,
      credentials.createSsl(readFileSync(this.auth.ca), readFileSync(this.auth.key), readFileSync(this.auth.cert)))
  }
  call<T>(method: string, request: object, token?: string): Promise<T> {
    const metadata = new Metadata()
    if (token) metadata.set('authorization', 'Bearer ' + token)
    return new Promise((resolve, reject) => this.client[method](request, metadata, { deadline: Date.now() + 6000 }, (error: ServiceError | null, response: T) => error ? reject(graphError(error)) : resolve(response)))
  }
  onModuleDestroy() { this.client.close() }
}
