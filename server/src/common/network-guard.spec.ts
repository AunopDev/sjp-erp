import { describe, expect, it } from 'vitest';
import { assertSafeUrl, isPrivateHost, isPrivateIp } from './network-guard.js';

describe('network guard', () => {
  it('blocks private IPv4 ranges', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.1.1', '100.64.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 in both dotted and hexadecimal forms', () => {
    for (const ip of ['::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:c0a8:101', '::1', 'fc00::1', 'fe80::1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp('2001:4860:4860::8888')).toBe(false);
  });

  it('blocks local hostnames and private literal URLs', () => {
    for (const host of ['localhost', 'api.local', 'service.internal', 'redis.lan']) {
      expect(isPrivateHost(host), host).toBe(true);
    }
    expect(() => assertSafeUrl('http://[::ffff:7f00:1]/hook')).toThrow();
    expect(() => assertSafeUrl('http://user:pass@example.com/hook')).toThrow();
    expect(assertSafeUrl('https://example.com/hook').hostname).toBe('example.com');
  });
});
