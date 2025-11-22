import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Request } from 'express';

import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const ctx = GqlExecutionContext.create(context);
    const gqlContext = ctx.getContext<{ req: Request & { user?: AuthenticatedUser } }>();

    return gqlContext.req.user;
  }
);
