import { cookies, headers } from "next/headers";

export function originFromHeaders(hdrs: Headers) {
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function nextServerRequest(path = "/") {
  const hdrs = await headers();
  const cookieStore = await cookies();
  const url = `${originFromHeaders(hdrs)}${path.startsWith("/") ? path : `/${path}`}`;
  const cookie = cookieStore.getAll().map((entry) => `${entry.name}=${entry.value}`).join("; ");
  return new Request(url, { headers: cookie ? { cookie } : {} });
}
