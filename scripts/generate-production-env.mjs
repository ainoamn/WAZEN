#!/usr/bin/env node
/**
 * Prints production-safe secrets for Vercel (never writes files).
 * Paste into Vercel Environment Variables. Do not commit output.
 */
import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("base64");
const payload = {
  WAZEN_DEMO_MODE: "0",
  WAZEN_USE_NODE_SQLITE: "0",
  WAZEN_TRUST_OAI_HEADERS: "0",
  WAZEN_ADMIN_EMAILS: "a.hamid89@hotmail.com",
  WAZEN_APP_ORIGIN: "https://YOUR_PRODUCTION_DOMAIN",
  WAZEN_PAYMENT_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
  WAZEN_JOB_SECRET: randomBytes(32).toString("hex"),
  WAZEN_ENCRYPTION_KEYRING: JSON.stringify({ active: "v1", keys: { v1: key } }),
  note: "Also set DATABASE_URL (Neon). Keep WAZEN_ADMIN_EMAILS until the real admin signs in once via BHD SSO, then you may remove it (role stays in DB).",
};

console.log("# Paste into Vercel Production (and Preview separately). Do not commit.");
for (const [keyName, value] of Object.entries(payload)) {
  console.log(`${keyName}=${value}`);
}
