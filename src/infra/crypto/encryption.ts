import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ENV } from "../../config/env.js";

const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

/**
 * Payload format: base64(iv[12] || authTag[16] || ciphertext), a single
 * string. `key` defaults to ENV.CREDENTIALS_ENCRYPTION_KEY; callers pass it
 * explicitly only in tests exercising a different key.
 */
export function encrypt(
  plaintext: string,
  key: Buffer = ENV.CREDENTIALS_ENCRYPTION_KEY,
): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(
  payload: string,
  key: Buffer = ENV.CREDENTIALS_ENCRYPTION_KEY,
): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH_BYTES);
  const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const ciphertext = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
