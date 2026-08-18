/** Stable browser identity so only one auth session can stay active per browser profile. */

export function browserIdCookieName() {
  return "wazen_browser";
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function browserIdFromRequest(request: Request) {
  const raw = cookieValue(request, browserIdCookieName());
  if (!raw || raw.length < 16 || raw.length > 128) return null;
  return raw;
}

export function browserIdCookie(id: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${browserIdCookieName()}=${encodeURIComponent(id)}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
}
