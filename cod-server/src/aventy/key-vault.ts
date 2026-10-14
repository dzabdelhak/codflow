import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface SealedKey {
  ciphertext: string;
  encryptionKeyId: string;
  hint: string;
}

export interface AventyKeyVault {
  currentKeyId: string;
  seal(storeId: string, key: string): SealedKey;
  open(storeId: string, sealed: Pick<SealedKey, "ciphertext" | "encryptionKeyId">): string;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

function parseEncryptionKey(raw: string, name: string): Buffer {
  const value = raw.trim();
  const bytes = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error(`${name} must be 32 bytes, hex or base64 (openssl rand -hex 32)`);
  return bytes;
}

const keyIdOf = (key: Buffer) => createHash("sha256").update(key).digest("hex").slice(0, 12);
const boundTo = (storeId: string) => Buffer.from(`codflow:aventy-key:${storeId}`);

export function createAventyKeyVault(current: string, previous?: string): AventyKeyVault {
  const currentKey = parseEncryptionKey(current, "AVENTY_KEY_ENCRYPTION_KEY");
  const keys = new Map([[keyIdOf(currentKey), currentKey]]);
  if (previous?.trim()) {
    const previousKey = parseEncryptionKey(previous, "AVENTY_KEY_ENCRYPTION_KEY_PREVIOUS");
    keys.set(keyIdOf(previousKey), previousKey);
  }
  const currentKeyId = keyIdOf(currentKey);

  return {
    currentKeyId,
    seal(storeId, key) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", currentKey, iv);
      cipher.setAAD(boundTo(storeId));
      const data = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
      return {
        ciphertext: Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64"),
        encryptionKeyId: currentKeyId,
        hint: key.slice(-4),
      };
    },
    open(storeId, sealed) {
      const encryptionKey = keys.get(sealed.encryptionKeyId);
      if (!encryptionKey) throw new Error(`No encryption key with id ${sealed.encryptionKeyId} is configured`);
      const raw = Buffer.from(sealed.ciphertext, "base64");
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey, raw.subarray(0, IV_BYTES));
      decipher.setAAD(boundTo(storeId));
      decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
    },
  };
}

export function aventyKeyVaultFromEnv(env: { AVENTY_KEY_ENCRYPTION_KEY?: string; AVENTY_KEY_ENCRYPTION_KEY_PREVIOUS?: string }): AventyKeyVault | null {
  return env.AVENTY_KEY_ENCRYPTION_KEY?.trim()
    ? createAventyKeyVault(env.AVENTY_KEY_ENCRYPTION_KEY, env.AVENTY_KEY_ENCRYPTION_KEY_PREVIOUS)
    : null;
}

export function redactKey(text: string, key: string | null | undefined): string {
  return key ? text.split(key).join("••••") : text;
}
