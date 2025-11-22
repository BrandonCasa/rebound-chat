import { Field, InputType } from '@nestjs/graphql';
import { IsAlphanumeric, IsString, Length } from 'class-validator';

@InputType({ description: 'Credentials used to exchange for JWT access tokens.' })
export class LoginInput {
  @Field()
  @IsAlphanumeric()
  @Length(3, 32)
  username!: string;

  @Field()
  @IsString()
  @Length(6, 72)
  password!: string;
}
