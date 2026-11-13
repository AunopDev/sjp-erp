import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface ResolvedTarget {
  address: string;
  family: number;
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home'];

function normaliseIp(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
}

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return numbers;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ipv4Parts(ip);
  if (!parts) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true;
  return false;
}

function expandIpv6(ip: string): string[] | null {
  const value = normaliseIp(ip);
  if (!value.includes(':')) return null;
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  return [...head, ...Array.from({ length: missing }, () => '0'), ...tail].map((group) =>
    group.padStart(4, '0'),
  );
}

/** True when the IP literal belongs to a private, loopback, link-local, multicast or reserved range. */
export function isPrivateIp(raw: string): boolean {
  const ip = normaliseIp(raw);
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version !== 6) return true;

  const mappedV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mappedV4) return isPrivateIpv4(mappedV4[1]);

  const groups = expandIpv6(ip);
  if (!groups) return true;
  const numbers = groups.map((group) => parseInt(group, 16));
  if (numbers.some((part) => !Number.isFinite(part))) return true;

  if (numbers.every((part) => part === 0)) return true;
  if (numbers.slice(0, 7).every((part) => part === 0) && numbers[7] === 1) return true;

  // IPv4-mapped IPv6 (::ffff:0:0/96), including the hexadecimal form such as ::ffff:7f00:1.
  if (numbers.slice(0, 5).every((part) => part === 0) && numbers[5] === 0xffff) {
    const ipv4 = `${numbers[6] >> 8}.${numbers[6] & 0xff}.${numbers[7] >> 8}.${numbers[7] & 0xff}`;
    return isPrivateIpv4(ipv4);
  }

  const first = numbers[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/** True for hostnames that must never be contacted by server-side integrations. */
export function isPrivateHost(raw: string): boolean {
  const host = normaliseIp(raw);
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::' || host === '::1') return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (isIP(host)) return isPrivateIp(host);
  return false;
}

export function assertSafeUrl(raw: string, allowPrivate = false): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL ไม่ถูกต้อง');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('รองรับเฉพาะ http/https');
  if (url.username || url.password) throw new Error('ไม่อนุญาตให้ใส่ชื่อผู้ใช้ใน URL');
  if (!allowPrivate && isPrivateHost(url.hostname)) throw new Error('ไม่อนุญาตให้เชื่อมต่อ localhost หรือเครือข่ายภายใน');
  return url;
}

/**
 * Resolve a hostname and return a single public address that later requests must pin to.
 * Private answers are rejected outright so a dual-answer DNS response cannot hide a private target.
 */
export async function resolveSafeAddress(rawHost: string, allowPrivate = false): Promise<ResolvedTarget> {
  const host = normaliseIp(rawHost);
  if (allowPrivate) {
    if (isIP(host) === 4) return { address: host, family: 4 };
    if (isIP(host) === 6) return { address: host, family: 6 };
    const addresses = await lookup(host, { all: true }).catch(() => []);
    if (!addresses.length) throw new Error('resolve hostname ไม่ได้');
    return { address: addresses[0].address, family: addresses[0].family };
  }
  if (isPrivateHost(host)) throw new Error('ไม่อนุญาตให้เชื่อมต่อ localhost หรือเครือข่ายภายใน');
  if (isIP(host) === 4) return { address: host, family: 4 };
  if (isIP(host) === 6) return { address: host, family: 6 };

  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error('resolve hostname ของปลายทางไม่ได้');
  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error('ปลายทางชี้ไปยังเครือข่ายภายใน');
  }
  return { address: addresses[0].address, family: addresses[0].family };
}

/** Assert that a host is safe to connect to. Used by integrations that cannot pin the socket. */
export async function assertSafeHost(rawHost: string, allowPrivate = false): Promise<void> {
  await resolveSafeAddress(rawHost, allowPrivate);
}

export interface PinnedResponse {
  status: number;
  text: string;
}

/**
 * POST JSON while pinning DNS to the address validated by resolveSafeAddress().
 * This closes the DNS-rebinding window between validation and the actual connection.
 */
export function postJsonPinned(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  target: ResolvedTarget,
  timeoutMs = 10000,
): Promise<PinnedResponse> {
  const url = new URL(rawUrl);
  const hostname = normaliseIp(url.hostname);
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = transport(
      {
        protocol: url.protocol,
        hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': String(Buffer.byteLength(body)),
        },
        servername: url.protocol === 'https:' ? hostname : undefined,
        lookup: ((_host: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) =>
          callback(null, target.address, target.family)) as never,
        timeout: timeoutMs,
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          if (text.length < 8192) text += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, text: text.slice(0, 2000) }));
      },
    );
    request.on('timeout', () => request.destroy(new Error('หมดเวลารอปลายทาง')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}
