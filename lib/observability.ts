/** Lightweight production observability (structured logs + optional Sentry ingest). */

type Severity = "error" | "warning" | "info";

function sentryDsn() {
  return process.env.SENTRY_DSN?.trim() || process.env.WAZEN_SENTRY_DSN?.trim() || "";
}

function scrub(value: unknown): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (value.length > 800) return `${value.slice(0, 800)}…`;
    return value.replace(/(bearer\s+|wzn_|sk_|whsec_)[a-zA-Z0-9._-]{8,}/gi, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(scrub);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, item]) => [
          key,
          /secret|password|token|authorization|cookie|keyring/i.test(key) ? "[REDACTED]" : scrub(item),
        ]),
    );
  }
  return String(value);
}

export function reportEvent(input: {
  level: Severity;
  code: string;
  message?: string;
  meta?: Record<string, unknown>;
  error?: unknown;
}) {
  const stack = input.error instanceof Error ? input.error.stack?.split("\n").slice(0, 10) : undefined;
  const message = input.message
    || (input.error instanceof Error ? input.error.message : input.error != null ? String(input.error) : input.code);
  const payload = {
    level: input.level,
    code: input.code,
    message,
    stack,
    meta: input.meta ? scrub(input.meta) : undefined,
    at: new Date().toISOString(),
    service: "wazen",
  };
  if (input.level === "error") console.error(JSON.stringify(payload));
  else if (input.level === "warning") console.warn(JSON.stringify(payload));
  else console.info(JSON.stringify(payload));

  const dsn = sentryDsn();
  if (!dsn || input.level === "info") return;
  void shipToSentry(dsn, payload).catch(() => { /* never block request path */ });
}

async function shipToSentry(dsn: string, payload: Record<string, unknown>) {
  // DSN: https://<key>@<host>/<project>
  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch {
    return;
  }
  const publicKey = parsed.username;
  const projectId = parsed.pathname.replace(/^\//, "");
  if (!publicKey || !projectId) return;
  const ingest = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`;
  const body = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    level: payload.level === "warning" ? "warning" : "error",
    logger: "wazen.observability",
    message: String(payload.message ?? payload.code),
    tags: { code: String(payload.code ?? ""), service: "wazen" },
    extra: scrub({ meta: payload.meta, stack: payload.stack }),
  };
  await fetch(ingest, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=wazen/1.0`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2500),
  });
}

export async function measureAsync<T>(code: string, run: () => Promise<T>, meta?: Record<string, unknown>) {
  const started = Date.now();
  try {
    const result = await run();
    const ms = Date.now() - started;
    if (ms >= 3000) {
      reportEvent({ level: "warning", code: `${code}_SLOW`, message: `${code} took ${ms}ms`, meta: { ...meta, ms } });
    }
    return result;
  } catch (error) {
    reportEvent({
      level: "error",
      code: `${code}_FAILED`,
      error,
      meta: { ...meta, ms: Date.now() - started },
    });
    throw error;
  }
}
