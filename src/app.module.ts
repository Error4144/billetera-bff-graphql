import { Global, Module } from '@nestjs/common'
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo'
import { GraphQLModule } from '@nestjs/graphql'
import { UsersGateway } from './users.gateway'
import { createResolvers, typeDefs, type HttpRequest, type HttpResponse } from './auth.schema'

export { readBffSettings } from './settings'

@Global()
@Module({ providers: [UsersGateway], exports: [UsersGateway] })
class UsersModule {}

@Module({
  imports: [UsersModule, GraphQLModule.forRootAsync<ApolloDriverConfig>({
    driver: ApolloDriver,
    imports: [UsersModule],
    inject: [UsersGateway],
    useFactory: (users: UsersGateway) => ({
      driver: ApolloDriver, path: '/graphql', typeDefs, resolvers: createResolvers(users),
      csrfPrevention: true, includeStacktraceInErrorResponses: false,
      context: ({ req, res }: { req: HttpRequest; res: HttpResponse }) => ({ req, res }),
    }),
  })],
})
export class AppModule {}
