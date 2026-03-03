/**
 * Token encryption helpers for at-rest credential protection.
 *
 * Uses AES-256-GCM with a key derived from the TOKEN_ENCRYPTION_KEY env var
 * (or falls back to JWT_SECRET). Each ciphertext includes its own random IV
 * and auth tag, so identical plaintext produces different ciphertext.
 *
 * Format: base64(iv:authTag:ciphertext) — prefixed with "enc:" to distinguish
 * from plaintext tokens during migration.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ENCRYPTED_PREFIX = "enc:";

function getDerivedKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY or JWT_SECRET must be set for token encryption"
    );
  }
  // Derive a fixed 32-byte key from the secret using scrypt with a static salt.
  // The salt is static so the same secret always produces the same key
  // (needed to decrypt previously encrypted tokens).
  return scryptSync(secret, "krak-scribe-token-salt", KEY_LENGTH);
}

/**
 * Encrypt a plaintext token for storage.
 * Returns a string prefixed with "enc:" containing base64(iv + authTag + ciphertext).
 */
export function encryptToken(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Concatenate iv + authTag + ciphertext and encode as base64
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return ENCRYPTED_PREFIX + combined.toString("base64");
}

/**
 * Decrypt a token from storage.
 * Handles both encrypted ("enc:...") and legacy plaintext tokens gracefully.
 */
export function decryptToken(stored: string): string {
  // Legacy plaintext token — return as-is
  if (!stored.startsWith(ENCRYPTED_PREFIX)) {
    return stored;
  }

  const key = getDerivedKey();
  const combined = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Check if a stored value is already encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}
