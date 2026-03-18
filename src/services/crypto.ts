/**
 * Password hashing utilities using Web Crypto API.
 * Uses PBKDF2 with SHA-256 for key derivation — significantly stronger than plain SHA-256.
 */

const ITERATIONS = 100_000;
const SALT_LENGTH = 16;

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    rawKey.buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
}

/**
 * Hash a password with a random salt. Returns "salt:hash" hex string.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const derived = await deriveKey(password, salt);
  return `${bufToHex(salt)}:${bufToHex(derived)}`;
}

/**
 * Verify a password against a stored "salt:hash" string.
 * Also supports legacy plaintext comparison for migration.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Legacy plaintext fallback: if stored value has no colon, it's plaintext
  if (!stored.includes(':')) {
    return password === stored;
  }
  const [saltHex, hashHex] = stored.split(':');
  const salt = hexToBuf(saltHex);
  const derived = await deriveKey(password, salt);
  return bufToHex(derived) === hashHex;
}
