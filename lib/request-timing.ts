/** Attach Server-Timing / X-Response-Time without changing response bodies. */

export async function withRequestTiming(
  label: string,
  run: () => Promise<Response>,
): Promise<Response> {
  const started = Date.now();
  const response = await run();
  const ms = Date.now() - started;
  const headers = new Headers(response.headers);
  headers.set("X-Response-Time", `${ms}ms`);
  const prior = headers.get("Server-Timing");
  const timing = `${label};dur=${ms}`;
  headers.set("Server-Timing", prior ? `${prior}, ${timing}` : timing);
  if (ms >= 3000) {
    try {
      const { reportEvent } = await import("./observability");
      reportEvent({
        level: "warning",
        code: `${label.toUpperCase()}_SLOW`,
        message: `${label} took ${ms}ms`,
        meta: { ms },
      });
    } catch { /* ignore */ }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
