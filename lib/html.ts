export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function safeDownloadFilename(value: string, fallback = "document") {
  const normalized = value.normalize("NFKC").replace(/[\p{Cc}<>:"/\\|?*]+/gu, "-").replace(/\.+$/g, "").trim();
  return (normalized || fallback).slice(0, 100);
}

export const downloadedHtmlCsp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
