"use client";

function csrfToken() {
  if (typeof document === "undefined") return "";
  for (const name of ["__Host-wazen_csrf", "wazen_csrf"]) {
    const prefix = `${name}=`;
    const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    if (value) return decodeURIComponent(value.slice(prefix.length));
  }
  return "";
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    let token = csrfToken();
    if (!token) {
      await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" });
      token = csrfToken();
    }
    if (token) headers.set("x-csrf-token", token);
  }
  return fetch(input, { ...init, headers, credentials: init.credentials ?? "same-origin" });
}
