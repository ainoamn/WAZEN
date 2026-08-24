import { ensureSchema, getRawDb } from "../../../../db/runtime";
import { ApiError, errorResponse } from "../../../../lib/security";
import { assertJobAuthorized } from "../../../../lib/job-auth";
import { configuredAllowedHosts, validateOutboundHttpsUrl } from "../../../../lib/outbound";

function authorized(request: Request) {
  assertJobAuthorized(request);
}

export async function POST(request: Request) {
  try {
    authorized(request);
    const configuredEndpoint = process.env.WAZEN_EMAIL_WEBHOOK_URL;
    const token = process.env.WAZEN_EMAIL_WEBHOOK_TOKEN;
    if (!configuredEndpoint || !token) throw new ApiError(503, "EMAIL_PROVIDER_NOT_CONFIGURED");
    const endpoint = validateOutboundHttpsUrl(configuredEndpoint, configuredAllowedHosts("email"));
    const db = getRawDb();
    await ensureSchema(db);
    const pending = await db.prepare("SELECT id,recipient,template,payload_json,attempts FROM email_outbox WHERE status='pending' AND attempts<5 ORDER BY created_at LIMIT 20").all<{ id: string; recipient: string; template: string; payload_json: string; attempts: number }>();
    let sent = 0;
    for (const message of pending.results) {
      try {
        const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ to: message.recipient, template: message.template, data: JSON.parse(message.payload_json) }) });
        if (!response.ok) throw new Error("PROVIDER_REJECTED");
        await db.prepare("UPDATE email_outbox SET status='sent',attempts=attempts+1,sent_at=? WHERE id=? AND status='pending'").bind(new Date().toISOString(), message.id).run();
        sent += 1;
      } catch {
        await db.prepare("UPDATE email_outbox SET attempts=attempts+1,status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'pending' END WHERE id=?").bind(message.id).run();
      }
    }
    return Response.json({ ok: true, processed: pending.results.length, sent });
  } catch (error) {
    return errorResponse(error);
  }
}
