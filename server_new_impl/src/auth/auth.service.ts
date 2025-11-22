import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthConfig } from '../config/auth.config';
import { User } from '../users/user.model';
import { UsersService } from '../users/users.service';

import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

interface AccessToken {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService
  ) {}

  validateUser(username: string, password: string): User | null {
    return this.usersService.validateCredentials(username, password);
  }

  async createAccessToken(user: User): Promise<AccessToken> {
    const authConfig = this.configService.get<AuthConfig>('auth');
    const expiresInSeconds = authConfig?.accessTokenTtlSeconds ?? 900;
    const payload: JwtPayload = { sub: user.id, username: user.username };

    const token = await this.jwtService.signAsync(payload, {
      secret: authConfig?.accessTokenSecret ?? 'dev-access-secret',
      expiresIn: `${expiresInSeconds}s`
    });

    return {
      token,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000)
    };
  }

  async login(username: string, password: string): Promise<{ token: string; user: User; expiresAt: Date }> {
    const validated = this.validateUser(username, password);

    if (!validated) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { token, expiresAt } = await this.createAccessToken(validated);

    return { token, user: validated, expiresAt };
  }

  getAuthenticatedUser(payload: JwtPayload): AuthenticatedUser | null {
    return this.usersService.findById(payload.sub);
  }
}
