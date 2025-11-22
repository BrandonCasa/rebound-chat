import { Field, GraphQLISODateTime, ObjectType } from '@nestjs/graphql';

import { User } from '../../users/user.model';

@ObjectType({ description: 'JWT access token response for authenticated sessions.' })
export class AuthPayload {
  @Field({ description: 'Short-lived JWT access token for authenticated requests.' })
  accessToken!: string;

  @Field(() => GraphQLISODateTime, {
    description: 'Timestamp representing when the access token will expire.'
  })
  expiresAt!: Date;

  @Field(() => User, { description: 'Profile for the authenticated user.' })
  user!: User;
}
