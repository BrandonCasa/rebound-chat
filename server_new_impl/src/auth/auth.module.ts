import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthConfig } from '../config/auth.config';
import { UsersModule } from '../users/users.module';

import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const authConfig = configService.get<AuthConfig>('auth');
        const accessTtlSeconds = authConfig?.accessTokenTtlSeconds ?? 900;

        return {
          secret: authConfig?.accessTokenSecret ?? 'dev-access-secret',
          signOptions: {
            expiresIn: `${accessTtlSeconds}s`
          }
        };
      }
    }),
    UsersModule
  ],
  providers: [AuthResolver, AuthService, GqlAuthGuard, JwtStrategy],
  exports: [AuthService]
})
export class AuthModule {}
