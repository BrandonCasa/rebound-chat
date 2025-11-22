import { ArgsType, Field } from '@nestjs/graphql';
import { IsAlphanumeric, IsLowercase, Length } from 'class-validator';

@ArgsType()
export class GetUserArgs {
  @Field({ description: 'Username to locate the target user profile.' })
  @IsAlphanumeric()
  @IsLowercase()
  @Length(3, 32)
  username!: string;
}
