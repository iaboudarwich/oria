import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM encryption for OAuth tokens at rest. Uses a dedicated key kept
// separate from any other secret, so a leak of one does not compromise the
// other. Both Gmail and the other Google services (Calendar, Drive) share this
// key: read GOOGLE_TOKEN_ENCRYPTION_KEY first, then fall back to the original
// GMAIL_TOKEN_ENCRYPTION_KEY so existing deployments keep working unchanged.
//
// Format: "<ivHex>:<authTagHex>:<ciphertextHex>". A fresh random IV per call.
//
// SECURITY: never log the plaintext input or the ciphertext output, and never
// expose either to the client. These functions are server-only.

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // standard GCM nonce length

/** The configured encryption key, preferring the new generalized name. */
function configuredKeyHex(): string | undefined {
  return process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
}

function getKey(): Buffer {
  const hex = configuredKeyHex();
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY (or GMAIL_TOKEN_ENCRYPTION_KEY) must be set to 64 hex characters (32 bytes).",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptToken(cipher: string): string {
  const key = getKey();
  const parts = cipher.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext.");
  }
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

/** True when the encryption key is configured (gates the Google connect flows). */
export function isTokenCryptoConfigured(): boolean {
  const hex = configuredKeyHex();
  return !!hex && /^[0-9a-fA-F]{64}$/.test(hex);
}
