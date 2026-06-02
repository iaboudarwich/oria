import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM encryption for OAuth tokens at rest. Uses a dedicated key
// (GMAIL_TOKEN_ENCRYPTION_KEY, 32 bytes as 64 hex chars) kept separate from
// any other secret, so a leak of one does not compromise the other.
//
// Format: "<ivHex>:<authTagHex>:<ciphertextHex>". A fresh random IV per call.
//
// SECURITY: never log the plaintext input or the ciphertext output, and never
// expose either to the client. These functions are server-only.

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // standard GCM nonce length

function getKey(): Buffer {
  const hex = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "GMAIL_TOKEN_ENCRYPTION_KEY must be set to 64 hex characters (32 bytes).",
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

/** True when the encryption key is configured (gates the Gmail UI/flow). */
export function isTokenCryptoConfigured(): boolean {
  const hex = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  return !!hex && /^[0-9a-fA-F]{64}$/.test(hex);
}
