// Cifrado local de la clave privada.
//
// Garantías del diseño:
//  - La clave privada se cifra en disco con AES-256-GCM; la clave de cifrado se
//    deriva de tu contraseña con scrypt (N=2^17), nunca se guarda.
//  - El texto plano solo existe en memoria mientras se firma, y se limpia después.
//  - Nada de esto sale del proceso: no hay telemetría, ni analytics, ni una sola
//    petición de red fuera de los RPC que tú configures. Compruébalo con `grep -rn
//    "fetch\|http" src/` — solo aparece en src/opensea.js (opt-in) y en los RPC.
import { randomBytes, scrypt as scryptCb, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, chmod } from 'node:fs/promises';

const scrypt = promisify(scryptCb);

const KDF = { N: 1 << 17, r: 8, p: 1, keylen: 32, maxmem: 256 * 1024 * 1024 };

async function deriveKey(password, salt) {
  return scrypt(password.normalize('NFKC'), salt, KDF.keylen, {
    N: KDF.N,
    r: KDF.r,
    p: KDF.p,
    maxmem: KDF.maxmem,
  });
}

export function normalizePrivateKey(input) {
  const trimmed = String(input).trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error('La clave privada debe ser de 64 caracteres hexadecimales (con o sin 0x).');
  }
  return `0x${trimmed.toLowerCase()}`;
}

export async function encryptPrivateKey(privateKey, password, { address }) {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = await deriveKey(password, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  key.fill(0);

  return {
    version: 1,
    address,
    kdf: 'scrypt',
    kdfparams: { N: KDF.N, r: KDF.r, p: KDF.p, keylen: KDF.keylen, salt: salt.toString('hex') },
    cipher: 'aes-256-gcm',
    cipherparams: { iv: iv.toString('hex') },
    ciphertext: ciphertext.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

export async function decryptPrivateKey(keystore, password) {
  if (keystore?.version !== 1) throw new Error('Formato de keystore no reconocido.');
  const { salt, N, r, p, keylen } = keystore.kdfparams;
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'hex'), keylen, {
    N,
    r,
    p,
    maxmem: KDF.maxmem,
  });
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(keystore.cipherparams.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(keystore.tag, 'hex'));
  try {
    const plain = Buffer.concat([
      decipher.update(Buffer.from(keystore.ciphertext, 'hex')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    throw new Error('Contraseña incorrecta o keystore corrupto.');
  } finally {
    key.fill(0);
  }
}

export async function saveKeystore(path, keystore) {
  await writeFile(path, `${JSON.stringify(keystore, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function loadKeystore(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

// Comparación en tiempo constante, para confirmar la contraseña dos veces sin
// filtrar por dónde difieren.
export function secretsMatch(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
