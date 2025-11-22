import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';

import { AuthModule } from './auth/auth.module';
import { appConfig, validationSchema } from './config/app.config';
import { authConfig } from './config/auth.config';
import { GraphqlConfigService } from './config/graphql-config.service';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig],
      validationSchema,
      expandVariables: true
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ConfigModule],
      useClass: GraphqlConfigService
    }),
    HealthModule,
    UsersModule,
    AuthModule
  ],
  providers: [GraphqlConfigService, Logger]
})
export class AppModule {}
