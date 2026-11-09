import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from './auth.module.js';

const config = (values: Record<string, string | undefined>): ConfigService =>
  ({ get: (key: string) => values[key] }) as ConfigService;

describe('resolveJwtSecret', () => {
  it('accepts a long non-placeholder secret', () => {
    const secret = 's'.repeat(48);
    expect(resolveJwtSecret(config({ JWT_SECRET: secret }))).toBe(secret);
  });

  it('rejects placeholder or short secrets in production', () => {
    expect(() => resolveJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET: 'change-me' }))).toThrow();
    expect(() => resolveJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET: 'short' }))).toThrow();
    expect(() => resolveJwtSecret(config({ NODE_ENV: 'production' }))).toThrow();
  });

  it('generates an ephemeral secret outside production', () => {
    const secret = resolveJwtSecret(config({ NODE_ENV: 'development' }));
    expect(secret).toHaveLength(96);
    expect(secret).not.toContain('change-me');
  });
});
