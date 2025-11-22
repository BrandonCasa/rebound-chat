import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'User profile summary exposed to clients.' })
export class User {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'Unique username/handle used for mentions and lookups.' })
  username!: string;

  @Field({ description: 'User-facing display name.' })
  displayName!: string;

  @Field({ nullable: true, description: 'Avatar image URL (to be swapped for signed S3 URLs later).' })
  avatarUrl?: string;

  @Field({ description: 'Creation timestamp for the user account.' })
  createdAt!: Date;
}
