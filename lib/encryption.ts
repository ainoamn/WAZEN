type Keyring = { active: string; keys: Record<string, string> };
type Envelope = { v: 1; k: string; i: string; c: string };

function bytesToBase64(bytes: Uint8Array) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function base64ToBytes(value: string) { const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }

export function loadKeyring(raw = process.env.WAZEN_ENCRYPTION_KEYRING ?? ""): Keyring {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("ENCRYPTION_KEYRING_INVALID"); }
  if (!parsed || typeof parsed !== "object") throw new Error("ENCRYPTION_KEYRING_INVALID");
  const candidate = parsed as Keyring;
  if (!candidate.active || !candidate.keys?.[candidate.active]) throw new Error("ENCRYPTION_KEYRING_INVALID");
  for (const value of Object.values(candidate.keys)) if (base64ToBytes(value).length !== 32) throw new Error("ENCRYPTION_KEY_INVALID");
  return candidate;
}

async function purposeKey(rawKey: string, purpose: string, usage: KeyUsage[]) {
  const material = await crypto.subtle.importKey("raw", base64ToBytes(rawKey), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("wazen:key-separation:v1"), info: new TextEncoder().encode(purpose) }, material, { name: "AES-GCM", length: 256 }, false, usage);
}

export async function encryptSecret(value: string, purpose: string, keyring = loadKeyring()) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); const key = await purposeKey(keyring.keys[keyring.active], purpose, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`wazen:${purpose}:v1`) }, key, new TextEncoder().encode(value));
  const envelope: Envelope = { v: 1, k: keyring.active, i: bytesToBase64(iv), c: bytesToBase64(new Uint8Array(ciphertext)) };
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(envelope)));
}

export async function decryptSecret(encrypted: string, purpose: string, keyring = loadKeyring()) {
  let envelope: Envelope;
  try { envelope = JSON.parse(new TextDecoder().decode(base64ToBytes(encrypted))) as Envelope; } catch { throw new Error("ENCRYPTED_VALUE_INVALID"); }
  if (envelope.v !== 1 || !keyring.keys[envelope.k]) throw new Error("ENCRYPTION_KEY_VERSION_UNAVAILABLE");
  const key = await purposeKey(keyring.keys[envelope.k], purpose, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.i), additionalData: new TextEncoder().encode(`wazen:${purpose}:v1`) }, key, base64ToBytes(envelope.c));
  return { value: new TextDecoder().decode(plaintext), keyVersion: envelope.k, needsRotation: envelope.k !== keyring.active };
}

export async function rotateSecret(encrypted: string, purpose: string, keyring = loadKeyring()) {
  const current = await decryptSecret(encrypted, purpose, keyring);
  return current.needsRotation ? encryptSecret(current.value, purpose, keyring) : encrypted;
}

