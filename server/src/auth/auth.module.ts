import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

const JWT_PLACEHOLDER = /change[-_ ]?me|dev[-_ ]?secret|example/i;

export function resolveJwtSecret(config: ConfigService): string {
  const secret = String(config.get<string>('JWT_SECRET') ?? '').trim();
  const production = config.get<string>('NODE_ENV') === 'production';
  if (secret.length >= 32 && !JWT_PLACEHOLDER.test(secret)) return secret;
  if (production) {
    throw new Error('JWT_SECRET is required in production and must be at least 32 characters without placeholder text');
  }
  new Logger('AuthModule').warn(
    'JWT_SECRET is missing, too short, or a placeholder — using a random ephemeral secret for this process. Sessions will reset on restart.',
  );
  return randomBytes(48).toString('hex');
}

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [UsersService, AuthService, AuthGuard],
  exports: [UsersService, AuthGuard],
})
export class AuthModule {}
