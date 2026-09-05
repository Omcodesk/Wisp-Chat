/**
 * Validates that the first bytes of a file actually match its declared MIME
 * type. A presigned PUT enforces that the client *declares* a matching
 * Content-Type, but nothing stops a client from declaring image/png while
 * uploading arbitrary bytes - this checks the real file signature so we
 * don't trust the extension/header alone (README "File validation").
 */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a,
  "image/webp": (b) =>
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50,
};

export function matchesFileSignature(mimeType: string, bytes: Uint8Array): boolean {
  const check = SIGNATURES[mimeType];
  if (!check) return false;
  return check(bytes);
}
