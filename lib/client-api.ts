"use client";

import { canQueueOffline, enqueueOfflineRequest, isNetworkFailure, offlineQueuedResponse } from "./offline-queue";

function csrfToken() {
  if (typeof document === "undefined") return "";
  for (const name of ["__Host-wazen_csrf", "wazen_csrf"]) {
    const prefix = `${name}=`;
    const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    if (value) return decodeURIComponent(value.slice(prefix.length));
  }
  return "";
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname + input.search;
  return input.url;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    let token = csrfToken();
    if (!token && (typeof navigator === "undefined" || navigator.onLine)) {
      await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" }).catch(() => {});
      token = csrfToken();
    }
    if (token) headers.set("x-csrf-token", token);
  }
  const url = requestUrl(input);
  const body = typeof init.body === "string" ? init.body : "";
  const headerBag: Record<string, string> = {};
  headers.forEach((value, key) => { headerBag[key] = value; });
  const queueable = typeof init.body === "string" && canQueueOffline(url, method);
  if (queueable && typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueueOfflineRequest({ url, method, headers: headerBag, body });
    return offlineQueuedResponse();
  }
  try {
    const response = await fetch(input, { ...init, headers, credentials: init.credentials ?? "same-origin" });
    return response;
  } catch (error) {
    if (queueable && isNetworkFailure(error)) {
      enqueueOfflineRequest({ url, method, headers: headerBag, body });
      return offlineQueuedResponse();
    }
    throw error;
  }
}
