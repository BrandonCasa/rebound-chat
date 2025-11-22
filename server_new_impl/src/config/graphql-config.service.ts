import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApolloDriverConfig } from '@nestjs/apollo';
import { GqlOptionsFactory } from '@nestjs/graphql';
import { Request, Response } from 'express';
import { join } from 'node:path';

import { AppConfig } from './app.config';

@Injectable()
export class GraphqlConfigService implements GqlOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createGqlOptions(): ApolloDriverConfig {
    const appConfig = this.configService.get<AppConfig>('app');

    const allowPlayground = appConfig?.graphqlPlayground ?? false;
    const env = appConfig?.env ?? 'development';

    return {
      autoSchemaFile: join(process.cwd(), 'dist', 'schema.graphql'),
      sortSchema: true,
      playground: allowPlayground,
      introspection: allowPlayground || env !== 'production',
      context: ({ req, res }: { req: Request; res: Response }) => ({ req, res })
    };
  }
}
