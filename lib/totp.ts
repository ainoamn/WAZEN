const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function decodeBase32(value: string) {
  const clean = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, ""); let bits = "";
  for (const character of clean) { const index = alphabet.indexOf(character); if (index < 0) throw new Error("INVALID_BASE32"); bits += index.toString(2).padStart(5, "0"); }
  const bytes: number[] = []; for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return new Uint8Array(bytes);
}

export function createTotpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20)); let bits = ""; for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let output = ""; for (let index = 0; index < bits.length; index += 5) output += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return output;
}

export async function totpCode(secret: string, step: number, digits = 6) {
  const counter = new ArrayBuffer(8); new DataView(counter).setBigUint64(0, BigInt(step));
  const key = await crypto.subtle.importKey("raw", decodeBase32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter)); const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

export async function verifyTotp(secret: string, code: string, options: { now?: number; period?: number; window?: number; lastUsedStep?: number | null } = {}) {
  if (!/^\d{6}$/.test(code)) return { valid: false, step: -1 };
  const period = options.period ?? 30; const currentStep = Math.floor((options.now ?? Date.now()) / 1000 / period); const window = Math.min(1, Math.max(0, options.window ?? 1));
  for (let delta = -window; delta <= window; delta += 1) {
    const step = currentStep + delta; if (step <= Number(options.lastUsedStep ?? -1)) continue;
    if (await totpCode(secret, step) === code) return { valid: true, step };
  }
  return { valid: false, step: -1 };
}

