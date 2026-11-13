const startsWith = (buffer: Buffer, bytes: number[]): boolean =>
  buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);

const ascii = (buffer: Buffer, value: string, offset = 0): boolean =>
  buffer.length >= offset + value.length && buffer.subarray(offset, offset + value.length).toString('latin1') === value;

const isText = (buffer: Buffer): boolean => !buffer.includes(0);

/** Reject files whose content does not look like the extension the client declared. */
export function matchesFileSignature(ext: string, buffer: Buffer): boolean {
  switch (ext) {
    case '.png':
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case '.jpg':
    case '.jpeg':
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case '.gif':
      return ascii(buffer, 'GIF87a') || ascii(buffer, 'GIF89a');
    case '.webp':
      return ascii(buffer, 'RIFF') && ascii(buffer, 'WEBP', 8);
    case '.pdf':
      return ascii(buffer, '%PDF-');
    case '.zip':
    case '.docx':
    case '.xlsx':
    case '.pptx':
      return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) || startsWith(buffer, [0x50, 0x4b, 0x07, 0x08]);
    case '.doc':
    case '.xls':
    case '.ppt':
      return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case '.rar':
      return ascii(buffer, 'Rar!\u001a\u0007');
    case '.7z':
      return startsWith(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    case '.dwg':
      return ascii(buffer, 'AC10') || ascii(buffer, 'AC1');
    case '.dxf':
    case '.txt':
    case '.csv':
      return isText(buffer);
    default:
      return false;
  }
}
