import { Field, Float, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Basic readiness signal for the GraphQL API.' })
export class HealthStatus {
  @Field()
  status!: string;

  @Field(() => Float, { description: 'Process uptime in seconds.' })
  uptime!: number;

  @Field({ description: 'Timestamp for when the health data was resolved.' })
  timestamp!: Date;
}
