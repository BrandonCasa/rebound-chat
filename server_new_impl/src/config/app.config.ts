import * as Joi from 'joi';

export type AppEnvironment = 'development' | 'test' | 'production';

export interface AppConfig {
  env: AppEnvironment;
  port: number;
  graphqlPlayground: boolean;
}

export const appConfig = () => ({
  app: {
    env: (process.env.NODE_ENV as AppEnvironment | undefined) ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    graphqlPlayground: process.env.GRAPHQL_PLAYGROUND !== 'false'
  }
});

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  GRAPHQL_PLAYGROUND: Joi.boolean()
    .truthy('true')
    .truthy('1')
    .falsy('false')
    .falsy('0')
    .default(true)
});
