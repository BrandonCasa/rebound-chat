import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { User } from '../users/user.model';
import { UsersService } from '../users/users.service';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginInput } from './dto/login.input';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { AuthPayload } from './models/auth-payload.model';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService
  ) {}

  @Mutation(() => AuthPayload, { description: 'Authenticate a user and mint an access token.' })
  async login(@Args('input') input: LoginInput): Promise<AuthPayload> {
    const { token, user, expiresAt } = await this.authService.login(input.username, input.password);

    return {
      accessToken: token,
      expiresAt,
      user
    };
  }

  @Query(() => User, {
    name: 'viewer',
    description: 'Return the currently authenticated user.',
    nullable: true
  })
  @UseGuards(GqlAuthGuard)
  viewer(@CurrentUser() user: AuthenticatedUser | undefined): User | null {
    if (!user) {
      return null;
    }

    return this.usersService.findById(user.id);
  }
}
