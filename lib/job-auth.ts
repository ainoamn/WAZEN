/** Shared authorization for cron / background jobs. */

import { ApiError } from "./api-error.ts";

export function assertJobAuthorized(request: Request) {
  const jobSecret = process.env.WAZEN_JOB_SECRET?.trim() ?? "";
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
  const supplied = request.headers.get("authorization") ?? "";
  const okJob = jobSecret.length >= 32 && supplied === `Bearer ${jobSecret}`;
  const okCron = cronSecret.length >= 16 && supplied === `Bearer ${cronSecret}`;
  if (!okJob && !okCron) throw new ApiError(401, "UNAUTHORIZED");
}

export async function recordJobRun(
  db: D1Database,
  job: string,
  status: "ok" | "error" | "skipped",
  detail: Record<string, unknown>,
) {
  try {
    await db.prepare(
      "INSERT INTO job_runs (id,job,status,detail_json,created_at) VALUES (?,?,?,?,?)",
    ).bind(crypto.randomUUID(), job, status, JSON.stringify(detail), new Date().toISOString()).run();
    await db.prepare(
      "DELETE FROM job_runs WHERE created_at<=?",
    ).bind(new Date(Date.now() - 14 * 86_400_000).toISOString()).run();
  } catch {
    /* table may not exist until schema migrate; ignore */
  }
}
