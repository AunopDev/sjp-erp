import { describe, expect, it } from 'vitest';
import { matchesFileSignature } from './file-signature.js';

describe('upload signature checks', () => {
  it('accepts matching signatures', () => {
    expect(matchesFileSignature('.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(matchesFileSignature('.pdf', Buffer.from('%PDF-1.7'))).toBe(true);
    expect(matchesFileSignature('.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(matchesFileSignature('.csv', Buffer.from('a,b\n1,2'))).toBe(true);
  });

  it('rejects mismatched or executable content', () => {
    expect(matchesFileSignature('.png', Buffer.from('MZ'))).toBe(false);
    expect(matchesFileSignature('.pdf', Buffer.from('<html>'))).toBe(false);
    expect(matchesFileSignature('.txt', Buffer.from([0x4d, 0x5a, 0x00]))).toBe(false);
  });
});
