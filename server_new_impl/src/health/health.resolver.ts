import { Query, Resolver } from '@nestjs/graphql';

import { HealthStatus } from './health-status.model';

@Resolver(() => HealthStatus)
export class HealthResolver {
  @Query(() => HealthStatus, {
    name: 'health',
    description: 'Liveness probe to verify the GraphQL server is running.'
  })
  health(): HealthStatus {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date()
    };
  }
}
