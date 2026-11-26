import { GraphQLError } from 'graphql'
import { date, UsersGateway, type Profile, type Preferences, type Session } from './users.gateway'

export interface HttpRequest { method: string; headers: Record<string, string | string[] | undefined>; ip?: string }
export interface HttpResponse { setHeader(name: string, value: string): void; status(code: number): HttpResponse; json(body: object): void }
type Context = { req: HttpRequest; res: HttpResponse }

export const typeDefs = `
  type UserProfile { id: ID!, email: String!, displayName: String!, version: String!, createdAt: String!, updatedAt: String! }
  type UserPreferences { currency: String!, timeZone: String!, microExpenseMaximumAmount: String!, microExpenseMinimumCount: Int!, version: String!, updatedAt: String! }
  type AuthPayload { profile: UserProfile!, preferences: UserPreferences! }
  type Query { viewer: UserProfile, userPreferences: UserPreferences }
  type Mutation {
    registerUser(email: String!, password: String!, displayName: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
    updateUserProfile(displayName: String!, expectedVersion: String!): UserProfile!
    updateUserPreferences(currency: String!, timeZone: String!, microExpenseMaximumAmount: String!, microExpenseMinimumCount: Int!, expectedVersion: String!): UserPreferences!
  }
`
export function cookieToken(header: string | undefined, name: string): string | undefined {
  const entries = (header ?? '').split(';').map(item => item.trim()).filter(item => item.startsWith(name + '='))
  if (entries.length !== 1) return undefined
  const token = entries[0].slice(name.length + 1)
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined
}
export function decimal(value: string) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new GraphQLError('Ingresa un entero positivo dentro del rango permitido.', { extensions: { code: 'BAD_USER_INPUT' } })
  return value
}
const profile = (p: Profile) => ({ ...p, createdAt: date(p.createdAt), updatedAt: date(p.updatedAt) })
const preferences = (p: Preferences) => ({ ...p, updatedAt: date(p.updatedAt) })

export function createResolvers(users: UsersGateway) {
  function cookie(ctx: Context, token: string, expires?: string) {
    ctx.res.setHeader('Set-Cookie', `${users.auth.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${users.auth.secure ? '; Secure' : ''}; ${expires ? 'Expires=' + new Date(expires).toUTCString() : 'Max-Age=0'}`)
    ctx.res.setHeader('Cache-Control', 'no-store')
  }
  function token(ctx: Context) { return cookieToken(typeof ctx.req.headers.cookie === 'string' ? ctx.req.headers.cookie : undefined, users.auth.cookieName) }
  async function authorized(ctx: Context) {
    const value = token(ctx)
    if (!value) throw new GraphQLError('Inicia sesión para continuar.', { extensions: { code: 'UNAUTHENTICATED' } })
    try {
      const session = await users.call<Session>('validateSession', {}, value)
      cookie(ctx, value, date(session.expiresAt))
      return value
    } catch (error) { if (error instanceof GraphQLError && error.extensions.code === 'UNAUTHENTICATED') cookie(ctx, ''); throw error }
  }
  async function optional<T>(ctx: Context, method: string, map: (value: T) => unknown) {
    if (!token(ctx)) return null
    try { const value = await authorized(ctx); return map(await users.call<T>(method, {}, value)) }
    catch (error) { if (error instanceof GraphQLError && error.extensions.code === 'UNAUTHENTICATED') return null; throw error }
  }
  return {
    Query: {
      viewer: (_: unknown, __: unknown, ctx: Context) => optional<Profile>(ctx, 'getProfile', profile),
      userPreferences: (_: unknown, __: unknown, ctx: Context) => optional<Preferences>(ctx, 'getPreferences', preferences),
    },
    Mutation: {
      registerUser: async (_: unknown, args: object) => {
        const result = await users.call<{ profile: Profile; preferences: Preferences }>('registerUser', args)
        return { profile: profile(result.profile), preferences: preferences(result.preferences) }
      },
      login: async (_: unknown, args: object, ctx: Context) => {
        const result = await users.call<{ sessionToken: string; session: Session }>('login', args)
        try {
          const p = await users.call<Profile>('getProfile', {}, result.sessionToken)
          const prefs = await users.call<Preferences>('getPreferences', {}, result.sessionToken)
          cookie(ctx, result.sessionToken, date(result.session.expiresAt))
          return { profile: profile(p), preferences: preferences(prefs) }
        } catch (error) { await users.call('logout', {}, result.sessionToken).catch(() => undefined); throw error }
      },
      logout: async (_: unknown, __: unknown, ctx: Context) => {
        const value = token(ctx)
        if (value) await users.call('logout', {}, value)
        cookie(ctx, '')
        return true
      },
      updateUserProfile: async (_: unknown, args: { displayName: string; expectedVersion: string }, ctx: Context) => {
        const value = await authorized(ctx)
        return profile(await users.call<Profile>('updateProfile', { ...args, expectedVersion: decimal(args.expectedVersion) }, value))
      },
      updateUserPreferences: async (_: unknown, args: { currency: string; timeZone: string; microExpenseMaximumAmount: string; microExpenseMinimumCount: number; expectedVersion: string }, ctx: Context) => {
        const value = await authorized(ctx)
        return preferences(await users.call<Preferences>('updatePreferences', { ...args, microExpenseMaximumAmount: decimal(args.microExpenseMaximumAmount), expectedVersion: decimal(args.expectedVersion) }, value))
      },
    },
  }
}
