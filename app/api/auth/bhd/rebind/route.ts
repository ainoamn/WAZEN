import { getRawDb, ensureSchema } from "../../../../../db/runtime";
import { authenticateRequest, createSession, sessionHeaders } from "../../../../../lib/auth";
import { upsertBhdUser } from "../../../../../lib/bhd-account";
import {
  identityIssuer,
  isBhdIdentityConfigured,
  publicRequestOrigin,
  safeReturnTo,
} from "../../../../../lib/bhd-identity";
import { clientCountry, clientIp, recordSecurityEvent } from "../../../../../lib/ip-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdentityProfile = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
};

async function profileFromWindowToken(token: string): Promise<IdentityProfile> {
  const issuer = identityIssuer();
  const response = await fetch(`${issuer}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`me_${response.status}`);
  const body = (await response.json()) as {
    user?: { id?: string; email?: string; name?: string; picture?: string | null } | null;
  };
  const user = body.user;
  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!user?.id || !email) throw new Error("claims");
  return {
    sub: user.id,
    email,
    name: typeof user.name === "string" && user.name.trim() ? user.name.trim() : email.split("@")[0],
    picture: typeof user.picture === "string" && user.picture.startsWith("https://") ? user.picture : null,
  };
}

function bindReturnPath(returnTo: string, sub: string) {
  const safe = safeReturnTo(returnTo);
  try {
    const url = new URL(safe, "https://bhd.local");
    url.searchParams.set("au", sub);
    url.searchParams.set("_bhd", String(Date.now()));
    return `${url.pathname}${url.search}`;
  } catch {
    return safe;
  }
}

function wantsJson(request: Request) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("application/json");
}

function jsonOk(
  payload: { ok: true; unchanged?: boolean; user: { id: string; email: string; name: string } },
  session?: Awaited<ReturnType<typeof createSession>>,
) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
  });
  if (session) {
    sessionHeaders(session).forEach((value, key) => headers.append(key, value));
  }
  return new Response(JSON.stringify(payload), { status: 200, headers });
}

async function rebind(request: Request) {
  const origin = (() => {
    try {
      return publicRequestOrigin(request);
    } catch {
      return new URL(request.url).origin;
    }
  })();
  const json = wantsJson(request);

  if (!isBhdIdentityConfigured()) {
    if (json) {
      return new Response(JSON.stringify({ ok: false, error: "sso" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    return Response.redirect(new URL("/login?local=1", origin), 303);
  }

  let token = "";
  let returnTo = "/home";
  const contentType = request.headers.get("content-type") || "";
  if (request.method === "POST" && contentType.includes("application/json")) {
    const json = (await request.json().catch(() => ({}))) as { token?: string; returnTo?: string };
    token = typeof json.token === "string" ? json.token.trim() : "";
    returnTo = safeReturnTo(json.returnTo);
  } else if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    token = String(form?.get("token") || "").trim();
    returnTo = safeReturnTo(String(form?.get("returnTo") || ""));
  } else {
    returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  }

  const header = request.headers.get("authorization");
  if (!token && header?.toLowerCase().startsWith("bearer ")) token = header.slice(7).trim();
  if (!token || token.length < 20) {
    if (json) {
      return new Response(JSON.stringify({ ok: false, error: "token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return Response.redirect(new URL(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`, origin), 303);
  }

  const db = getRawDb();
  await ensureSchema(db);

  try {
    const profile = await profileFromWindowToken(token);
    const current = await authenticateRequest(db, request);
    if (current?.bhdSub && current.bhdSub === profile.sub) {
      if (json) {
        return jsonOk({
          ok: true,
          unchanged: true,
          user: { id: profile.sub, email: current.email, name: current.displayName || profile.name },
        });
      }
      const next = bindReturnPath(returnTo, profile.sub);
      const headers = new Headers();
      headers.set("Location", `${origin}${next}`);
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      headers.set("Pragma", "no-cache");
      return new Response(null, { status: 303, headers });
    }

    const user = await upsertBhdUser(db, {
      sub: profile.sub,
      email: profile.email,
      emailVerified: true,
      name: profile.name,
      picture: profile.picture,
      preferredUsername: null,
      phoneNumber: null,
    });
    const session = await createSession(db, user.id, request);
    await recordSecurityEvent(db, {
      ip: clientIp(request),
      userId: user.id,
      eventType: user.created ? "auth.bhd_rebind_registered" : "auth.bhd_rebind",
      countryCode: clientCountry(request),
      userAgent: request.headers.get("user-agent"),
    });
    if (json) {
      return jsonOk(
        {
          ok: true,
          user: {
            id: user.bhdSub || profile.sub,
            email: user.email,
            name: user.displayName || profile.name,
          },
        },
        session,
      );
    }
    const next = bindReturnPath(returnTo, profile.sub);
    const headers = sessionHeaders(session);
    headers.set("Location", `${origin}${next}`);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    headers.set("Pragma", "no-cache");
    return new Response(null, { status: 303, headers });
  } catch {
    if (json) {
      return new Response(JSON.stringify({ ok: false, error: "rebind" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return Response.redirect(
      new URL(
        `/api/auth/bhd/logout?continue=${encodeURIComponent(`/api/auth/bhd/start?returnTo=${encodeURIComponent(returnTo)}`)}`,
        origin,
      ),
      303,
    );
  }
}

export const POST = rebind;
export const GET = rebind;
