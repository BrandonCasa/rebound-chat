import { Args, Query, Resolver } from '@nestjs/graphql';

import { GetUserArgs } from './dto/get-user.args';
import { User } from './user.model';
import { UsersService } from './users.service';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User, {
    name: 'user',
    nullable: true,
    description: 'Lookup a user by username. Will connect to PostgreSQL once the data layer lands.'
  })
  user(@Args() args: GetUserArgs): User | null {
    return this.usersService.findByUsername(args.username);
  }
}
