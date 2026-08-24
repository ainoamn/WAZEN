/** Per-user / per-API-key rate limits for Business API v1. */

import type { RequestUser } from "../db/runtime";
import { rateLimit } from "./security";

export async function enforceV1RateLimit(
  db: D1Database,
  request: Request,
  user: RequestUser,
  mode: "read" | "write" = "read",
) {
  const scope = user.authType === "api_key"
    ? `v1:key:${user.id}:${mode}`
    : `v1:user:${user.id}:${mode}`;
  const limit = mode === "write" ? 120 : 300;
  await rateLimit(db, request, scope, limit, 60);
}
