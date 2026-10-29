"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DEFAULT_BHD_IDENTITY_ISSUER } from "../../lib/bhd-identity";
import type { AuthProviderMark } from "../../lib/bhd-multi-account";
import { hopOrigins, launchUrlForApp, type BhdApp } from "../../lib/bhd/apps";
import { useBhdCatalog } from "../../lib/identity/use-bhd-catalog";
import { BhdAppIcon } from "./BhdAppIcon";

export type { AuthProviderMark };

export type BhdSwitcherUser = {
  id?: string;
  name: string;
  email: string;
  username?: string | null;
  phone?: string | null;
  picture: string | null;
  providers?: AuthProviderMark[];
  googleLinked?: boolean;
  facebookLinked?: boolean;
  hasPassword?: boolean;
};

type Panel = "apps" | "account" | null;

const COPY = {
  ar: {
    appsAria: "تطبيقات BHD",
    accountAria: "الحساب",
    appsTitle: "تطبيقات BHD",
    account: "الحساب",
    signOut: "خروج من هذا الحساب",
    signOutAll: "خروج من كل الحسابات",
    addAccount: "إضافة حساب آخر",
    switchTo: "تبديل إلى",
    manage: "إدارة الحساب",
    providerPassword: "تسجيل عادي",
    providerGoogle: "جوجل",
    providerFacebook: "فيسبوك",
    providerWhatsapp: "واتساب",
  },
  en: {
    appsAria: "BHD apps",
    accountAria: "Account",
    appsTitle: "BHD apps",
    account: "Account",
    signOut: "Sign out of this account",
    signOutAll: "Sign out of all accounts",
    addAccount: "Add another account",
    switchTo: "Switch to",
    manage: "Manage account",
    providerPassword: "Password",
    providerGoogle: "Google",
    providerFacebook: "Facebook",
    providerWhatsapp: "WhatsApp",
  },
} as const;

type SwitcherCopy = (typeof COPY)[keyof typeof COPY];

function accountProviders(user: BhdSwitcherUser): AuthProviderMark[] {
  const found = new Set<AuthProviderMark>(user.providers || []);
  if (user.googleLinked) found.add("google");
  if (user.facebookLinked) found.add("facebook");
  if (user.hasPassword) found.add("password");
  const picture = user.picture || "";
  if (picture.includes("googleusercontent.com")) found.add("google");
  if (picture.includes("fbcdn.net") || picture.includes("facebook.com")) found.add("facebook");
  return (["password", "google", "facebook", "whatsapp"] as const).filter((item) => found.has(item));
}

function accountHandle(user: BhdSwitcherUser) {
  return user.email || user.username || user.phone || user.name;
}

function accountMeta(user: BhdSwitcherUser) {
  return [user.username, user.phone].filter(
    (item, index, list) => item && list.indexOf(item) === index && item !== user.email,
  );
}

function stripSlash(value: string) {
  return value.replace(/\/$/, "");
}

function isCurrentApp(app: BhdApp, pageOrigin: string) {
  const here = stripSlash(pageOrigin);
  if (app.id === "account") return here === "https://id.bhd-om.com";
  if (app.id === "portal") {
    return (
      here === "https://www.bhd-om.com"
      || here === "https://bhd-om.com"
      || here.endsWith(".vercel.app")
      || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(here)
    );
  }
  if (app.id === "wazen") {
    return (
      here === "https://wazen.bhd-om.com"
      || here === "https://wazen-roan.vercel.app"
      || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(here)
    );
  }
  return Boolean(app.origin) && here === stripSlash(app.origin);
}

function accountPageUrl(pageOrigin: string, apps: BhdApp[]) {
  if (!pageOrigin) return `${DEFAULT_BHD_IDENTITY_ISSUER}/account`;
  const accountApp = apps.find((app) => app.id === "account");
  const portalApp = apps.find((app) => app.id === "portal");
  if (
    (accountApp && isCurrentApp(accountApp, pageOrigin))
    || (portalApp && isCurrentApp(portalApp, pageOrigin))
  ) {
    return "/account";
  }
  return `${DEFAULT_BHD_IDENTITY_ISSUER}/account`;
}

function ProviderMarks({
  providers,
  t,
}: {
  providers: AuthProviderMark[];
  t: SwitcherCopy;
}) {
  const labels: Record<AuthProviderMark, { mark: string; label: string }> = {
    password: { mark: "●", label: t.providerPassword },
    google: { mark: "G", label: t.providerGoogle },
    facebook: { mark: "f", label: t.providerFacebook },
    whatsapp: { mark: "WA", label: t.providerWhatsapp },
  };
  if (!providers.length) return null;
  return (
    <span className="bhd-switcher-providers">
      {providers.map((id) => (
        <abbr key={id} className={`bhd-switcher-provider is-${id}`} title={labels[id].label} aria-label={labels[id].label}>
          {labels[id].mark}
        </abbr>
      ))}
    </span>
  );
}

function Face({ user, large = false }: { user: BhdSwitcherUser; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  const show = Boolean(user.picture) && !broken;
  const initial = (user.name || user.email || "B").trim().slice(0, 1).toUpperCase();
  return (
    <span className={large ? "bhd-switcher-face is-large" : "bhd-switcher-face"}>
      {show ? (
        <img
          src={user.picture || undefined}
          alt=""
          width={large ? 56 : 40}
          height={large ? 56 : 40}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}

function AccountRow({
  user,
  t,
  large = false,
}: {
  user: BhdSwitcherUser;
  t: SwitcherCopy;
  large?: boolean;
}) {
  const meta = accountMeta(user);
  return (
    <span className="bhd-switcher-person">
      <Face user={user} large={large} />
      <span className="bhd-switcher-who">
        <strong dir="ltr">{accountHandle(user)}</strong>
        <span className="bhd-switcher-who-meta">
          <ProviderMarks providers={accountProviders(user).slice(0, 1)} t={t} />
          {meta.length ? <small dir="ltr">{meta.join(" · ")}</small> : null}
        </span>
      </span>
    </span>
  );
}

function hintHop(url: string) {
  if (!url || url.startsWith("/")) return;
  const origin = new URL(url, window.location.origin).origin;
  if (!document.head.querySelector(`link[data-bhd-hop="${origin}"]`)) {
    const pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = origin;
    pre.setAttribute("data-bhd-hop", origin);
    document.head.appendChild(pre);
  }
  if (!document.head.querySelector(`link[data-bhd-prefetch="${url}"]`)) {
    const prefetch = document.createElement("link");
    prefetch.rel = "prefetch";
    prefetch.as = "document";
    prefetch.href = url;
    prefetch.setAttribute("data-bhd-prefetch", url);
    document.head.appendChild(prefetch);
  }
}

function openApp(app: BhdApp, pageOrigin: string, apps: BhdApp[], push: (href: string) => void) {
  const url = app.mode === "identity" ? accountPageUrl(pageOrigin, apps) : launchUrlForApp(app, pageOrigin);
  if (url.startsWith("/")) {
    push(url);
    return;
  }
  try {
    const target = new URL(url);
    if (target.origin === window.location.origin) {
      push(`${target.pathname}${target.search}${target.hash}`);
      return;
    }
  } catch {
    /* fall through */
  }
  window.location.assign(url);
}

export function BhdAppSwitcher({
  user,
  accounts = [],
  onSignOut,
  onSignOutAll,
  onSwitchAccount,
  onAddAccount,
  locale = "ar",
}: {
  user: BhdSwitcherUser;
  accounts?: BhdSwitcherUser[];
  onSignOut: () => void | Promise<void>;
  onSignOutAll?: () => void | Promise<void>;
  onSwitchAccount?: (sub: string) => void | Promise<void>;
  onAddAccount?: () => void;
  locale?: "ar" | "en";
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [origin, setOrigin] = useState("");
  const [pictureBroken, setPictureBroken] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const appsId = useId();
  const accountId = useId();
  const router = useRouter();
  const catalogApps = useBhdCatalog();
  const t = COPY[locale];
  const isArabic = locale === "ar";

  useEffect(() => {
    setOrigin(window.location.origin);
    hopOrigins(catalogApps).forEach((item) => hintHop(item));
  }, [catalogApps]);

  useEffect(() => {
    setPictureBroken(false);
  }, [user.picture]);

  const close = useCallback(() => setPanel(null), []);

  useEffect(() => {
    if (!panel) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [panel, close]);

  useEffect(() => {
    if (panel !== "apps" || !origin) return;
    catalogApps.forEach((app) => {
      if (!app.enabled) return;
      if (app.mode === "identity") {
        hintHop(accountPageUrl(origin, catalogApps));
        return;
      }
      hintHop(launchUrlForApp(app, origin));
      if (app.startUrl) hintHop(app.startUrl);
    });
  }, [panel, origin, catalogApps]);

  function onAppClick(app: BhdApp) {
    if (!app.enabled) return;
    if (app.id === "account") {
      if (window.location.pathname.startsWith("/account")) {
        close();
        return;
      }
      openApp(app, origin, catalogApps, (href) => {
        close();
        router.push(href);
      });
      return;
    }
    if (origin && isCurrentApp(app, origin)) {
      close();
      return;
    }
    openApp(app, origin, catalogApps, (href) => {
      close();
      router.push(href);
    });
  }

  const initial = (user.name || user.email || "B").trim().slice(0, 1).toUpperCase() || "B";
  const showPicture = Boolean(user.picture) && !pictureBroken;

  return (
    <div className="bhd-switcher-slot" ref={rootRef}>
      <button
        type="button"
        className="bhd-switcher-grid"
        aria-label={t.appsAria}
        aria-haspopup="dialog"
        aria-expanded={panel === "apps"}
        aria-controls={panel === "apps" ? appsId : undefined}
        onClick={() => setPanel((current) => (current === "apps" ? null : "apps"))}
      >
        <span aria-hidden="true">
          {Array.from({ length: 9 }).map((_, index) => (
            <i key={index} />
          ))}
        </span>
      </button>

      <button
        type="button"
        className="bhd-switcher-avatar"
        aria-label={t.accountAria}
        aria-haspopup="dialog"
        aria-expanded={panel === "account"}
        aria-controls={panel === "account" ? accountId : undefined}
        onClick={() => setPanel((current) => (current === "account" ? null : "account"))}
      >
        {showPicture ? (
          <img
            src={user.picture || undefined}
            alt=""
            width={32}
            height={32}
            referrerPolicy="no-referrer"
            onError={() => setPictureBroken(true)}
          />
        ) : (
          <span>{initial}</span>
        )}
      </button>

      {panel === "apps" ? (
        <div className="bhd-switcher-card" id={appsId} role="dialog" aria-label={t.appsAria}>
          <div className="bhd-switcher-card-head">
            <p>{t.appsTitle}</p>
          </div>
          <div className="bhd-switcher-grid-apps">
            {catalogApps.map((app) => {
              const current = origin ? isCurrentApp(app, origin) : false;
              const label = isArabic ? app.nameAr : app.nameEn;
              return (
                <button
                  key={app.id}
                  type="button"
                  className={app.enabled ? "bhd-switcher-app" : "bhd-switcher-app is-disabled"}
                  disabled={!app.enabled}
                  aria-disabled={!app.enabled}
                  aria-current={current ? "page" : undefined}
                  onClick={() => onAppClick(app)}
                >
                  <BhdAppIcon
                    id={app.id}
                    title={label}
                    className={current ? "bhd-switcher-mark is-current" : "bhd-switcher-mark"}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {panel === "account" ? (
        <div className="bhd-switcher-card bhd-switcher-account" id={accountId} role="dialog" aria-label={t.accountAria}>
          <div className="bhd-switcher-account-now">
            <AccountRow user={user} t={t} large />
            <a className="bhd-switcher-manage" href={accountPageUrl(origin, catalogApps)}>
              {t.manage}
            </a>
          </div>
          <div className="bhd-switcher-account-list">
            {accounts
              .filter((item) => (item.id || item.email) !== (user.id || user.email))
              .map((item) => (
                <button
                  key={item.id || item.email}
                  type="button"
                  className="bhd-switcher-account-choice"
                  aria-label={`${t.switchTo} ${accountHandle(item)}`}
                  onClick={() => void onSwitchAccount?.(item.id || item.email)}
                >
                  <AccountRow user={item} t={t} />
                </button>
              ))}
            {onAddAccount ? (
              <button type="button" className="bhd-switcher-account-choice" onClick={onAddAccount}>
                <span className="bhd-switcher-person">
                  <span className="bhd-switcher-face is-action" aria-hidden="true">
                    <span>+</span>
                  </span>
                  <span className="bhd-switcher-who">
                    <strong>{t.addAccount}</strong>
                  </span>
                </span>
              </button>
            ) : null}
          </div>
          <div className="bhd-switcher-account-foot">
            <button type="button" className="bhd-switcher-account-choice" onClick={() => void onSignOut()}>
              {t.signOut}
            </button>
            {onSignOutAll ? (
              <button type="button" className="bhd-switcher-account-choice" onClick={() => void onSignOutAll()}>
                {t.signOutAll}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
