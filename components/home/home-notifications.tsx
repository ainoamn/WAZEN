"use client";

import Link from "next/link";
import { Bell, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../lib/client-api";

type Locale = "ar" | "en";

export type HomeWorkspaceAlert = {
  id: string;
  severity: "info" | "warning" | "danger";
  href?: string;
  ar: string;
  en: string;
  inviteId?: string;
};

export type HomeUserNotification = {
  id: string;
  severity: "info" | "warning" | "danger";
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
  dedupeKey?: string | null;
};

export function HomeNotificationBell({
  locale,
  notifications,
  workspaceAlerts,
  onAcceptInvite,
  acceptingInviteId,
}: {
  locale: Locale;
  notifications: HomeUserNotification[];
  workspaceAlerts: HomeWorkspaceAlert[];
  onAcceptInvite: (inviteId: string) => void;
  acceptingInviteId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const rows: Array<{ id: string; title: string; detail: string; href?: string | null; inviteId?: string; unread?: boolean }> = [];
    const seen = new Set<string>();
    for (const note of notifications) {
      const key = note.dedupeKey || note.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const inviteId = note.dedupeKey?.startsWith("invite:")
        ? note.dedupeKey.slice("invite:".length)
        : note.href?.includes("acceptInvite=")
          ? decodeURIComponent(String(note.href.split("acceptInvite=")[1] || "").split("&")[0])
          : undefined;
      rows.push({
        id: `note:${note.id}`,
        title: locale === "ar" ? note.titleAr : note.titleEn,
        detail: locale === "ar" ? note.bodyAr : note.bodyEn,
        href: note.href,
        inviteId: inviteId || undefined,
        unread: !note.readAt,
      });
    }
    for (const alert of workspaceAlerts) {
      if (seen.has(alert.id)) continue;
      seen.add(alert.id);
      rows.push({
        id: `alert:${alert.id}`,
        title: locale === "ar" ? alert.ar : alert.en,
        detail: "",
        href: alert.href,
        inviteId: alert.inviteId || (alert.id.startsWith("invite:") ? alert.id.slice("invite:".length) : undefined),
        unread: true,
      });
    }
    return rows.slice(0, 20);
  }, [locale, notifications, workspaceAlerts]);

  const unreadCount = items.filter((item) => item.unread).length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void apiFetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "markRead" }),
    }).catch(() => {});
  }, [open]);

  return (
    <div className="notification-wrap home-notification-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-button notification-button"
        aria-expanded={open}
        aria-label={locale === "ar" ? "التنبيهات" : "Notifications"}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={19} />
        {unreadCount > 0 ? <i /> : null}
      </button>
      {open ? (
        <div className="notification-panel home-notification-panel" role="menu">
          <h3>{locale === "ar" ? "التنبيهات" : "Notifications"}</h3>
          {items.length === 0 ? (
            <p className="notification-empty">{locale === "ar" ? "لا توجد تنبيهات حالياً." : "No alerts right now."}</p>
          ) : null}
          {items.map((item) => (
            <div key={item.id} className={`notification-item${item.unread ? " is-unread" : ""}`}>
              <strong>{item.title}</strong>
              {item.detail && item.detail !== item.title ? <span>{item.detail}</span> : null}
              <div className="home-notification-actions">
                {item.inviteId ? (
                  <button
                    type="button"
                    className="primary-button compact"
                    disabled={acceptingInviteId === item.inviteId}
                    onClick={() => {
                      onAcceptInvite(item.inviteId!);
                      setOpen(false);
                    }}
                  >
                    {acceptingInviteId === item.inviteId
                      ? (locale === "ar" ? "جارٍ القبول…" : "Accepting…")
                      : (locale === "ar" ? "موافقة" : "Accept")}
                  </button>
                ) : item.href ? (
                  <a href={item.href} onClick={() => setOpen(false)}>{locale === "ar" ? "فتح" : "Open"}</a>
                ) : (
                  <Link href="/dashboard" onClick={() => setOpen(false)}>{locale === "ar" ? "التحكم" : "Control"}</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function HomeWorkspaceAlertsBanner({
  locale,
  alerts,
  acceptingInviteId,
  onAcceptInvite,
  onDismiss,
}: {
  locale: Locale;
  alerts: HomeWorkspaceAlert[];
  acceptingInviteId: string | null;
  onAcceptInvite: (inviteId: string) => void;
  onDismiss: (alert: HomeWorkspaceAlert) => void;
}) {
  if (!alerts.length) return null;
  return (
    <div className="workspace-alerts home-workspace-alerts" role="status">
      {alerts.map((alert) => {
        const inviteId = alert.inviteId || (alert.id.startsWith("invite:") ? alert.id.slice("invite:".length) : "");
        return (
          <div key={alert.id} className={`workspace-alert is-${alert.severity}`}>
            <p>{locale === "ar" ? alert.ar : alert.en}</p>
            <div className="workspace-alert-actions">
              {inviteId ? (
                <button
                  type="button"
                  className="primary-button compact"
                  disabled={acceptingInviteId === inviteId}
                  onClick={() => onAcceptInvite(inviteId)}
                >
                  {acceptingInviteId === inviteId
                    ? (locale === "ar" ? "جارٍ القبول…" : "Accepting…")
                    : (locale === "ar" ? "موافقة" : "Accept")}
                </button>
              ) : null}
              {alert.href && !inviteId ? <a href={alert.href}>{locale === "ar" ? "فتح" : "Open"}</a> : null}
              <button
                type="button"
                className="workspace-alert-dismiss"
                aria-label={locale === "ar" ? "إغلاق الملاحظة" : "Dismiss alert"}
                onClick={() => onDismiss(alert)}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
