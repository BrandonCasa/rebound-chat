import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-jwt';

import { AuthConfig } from '../../config/auth.config';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService
  ) {
    const authConfig = configService.get<AuthConfig>('auth');
    const jwtFromRequest = (req: Request): string | null => {
      const authHeader = req.headers?.authorization;

      if (typeof authHeader === 'string') {
        const [scheme, token] = authHeader.split(' ');

        if (scheme === 'Bearer' && token) {
          return token;
        }
      }

      const cookies = req.cookies as Record<string, unknown> | undefined;
      const cookieToken =
        typeof cookies?.access_token === 'string' ? cookies.access_token : undefined;

      return cookieToken ?? null;
    };

    super({
      jwtFromRequest,
      secretOrKey: authConfig?.accessTokenSecret ?? 'dev-access-secret',
      ignoreExpiration: false
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser | null {
    return this.usersService.findById(payload.sub);
  }
}
