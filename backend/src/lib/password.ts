import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt password hashing (node:crypto, no native build step). Format: scrypt$N$r$p$salt$hash (base64). */

const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: n, r, p, maxmem: MAX_MEM }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;
  if (!nRaw || !rRaw || !pRaw || !saltRaw || !keyRaw) return false;
  const expected = Buffer.from(keyRaw, 'base64');
  const actual = await derive(password, Buffer.from(saltRaw, 'base64'), Number(nRaw), Number(rRaw), Number(pRaw), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
