"use client";

import { CSSProperties, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { DEFAULT_BHD_IDENTITY_ISSUER } from "../../lib/bhd-identity";
import type { AuthProviderMark } from "../../lib/bhd-multi-account";
import { BHD_APPS, launchUrlForApp, type BhdApp } from "../../lib/bhd/apps";
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
    addAccount: "إضافة حساب",
    switchTo: "تبديل إلى",
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
    addAccount: "Add account",
    switchTo: "Switch to",
    providerPassword: "Password",
    providerGoogle: "Google",
    providerFacebook: "Facebook",
    providerWhatsapp: "WhatsApp",
  },
} as const;

type SwitcherCopy = (typeof COPY)["ar"];

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

function accountPageUrl(pageOrigin: string) {
  if (!pageOrigin) return `${DEFAULT_BHD_IDENTITY_ISSUER}/account`;
  const accountApp = BHD_APPS.find((app) => app.id === "account");
  const portalApp = BHD_APPS.find((app) => app.id === "portal");
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

function AccountIdentity({ user, t }: { user: BhdSwitcherUser; t: SwitcherCopy }) {
  const meta = accountMeta(user);
  return (
    <div className="bhd-switcher-identity">
      <strong>{accountHandle(user)}</strong>
      {meta.length ? <small>{meta.join(" · ")}</small> : null}
      <ProviderMarks providers={accountProviders(user)} t={t} />
    </div>
  );
}

function openApp(app: BhdApp, pageOrigin: string) {
  if (app.mode === "identity") {
    window.location.assign(accountPageUrl(pageOrigin));
    return;
  }
  window.location.assign(launchUrlForApp(app, pageOrigin));
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
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const [origin, setOrigin] = useState("");
  const [pictureBroken, setPictureBroken] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const appsId = useId();
  const accountId = useId();
  const t = COPY[locale];
  const isArabic = locale === "ar";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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

  useLayoutEffect(() => {
    if (!panel) {
      setPanelStyle(null);
      return;
    }

    const updatePosition = () => {
      const anchor = rootRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const gutter = 12;
      const width = Math.min(320, Math.max(220, window.innerWidth - (gutter * 2)));
      const prefersRtl = document.documentElement.dir === "rtl";
      const desiredLeft = prefersRtl ? anchor.left : anchor.right - width;
      const left = Math.min(Math.max(desiredLeft, gutter), window.innerWidth - width - gutter);
      const top = Math.max(gutter, anchor.bottom + 10);
      setPanelStyle({
        position: "fixed",
        top,
        left,
        width,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [panel]);

  function onAppClick(app: BhdApp) {
    if (!app.enabled) return;
    if (app.id === "account") {
      window.location.assign(accountPageUrl(origin));
      return;
    }
    if (origin && isCurrentApp(app, origin)) {
      close();
      return;
    }
    openApp(app, origin);
  }

  const handle = accountHandle(user);
  const initial = (handle || user.name || "B").trim().slice(0, 1).toUpperCase() || "B";
  const showPicture = Boolean(user.picture) && !pictureBroken;
  const otherAccounts = accounts.filter((item) => (item.id || item.email || item.username || item.phone) !== (user.id || user.email || user.username || user.phone));

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
        <div className="bhd-switcher-card" style={panelStyle ?? undefined} id={appsId} role="dialog" aria-label={t.appsAria}>
          <div className="bhd-switcher-card-head">
            <p>{t.appsTitle}</p>
          </div>
          <div className="bhd-switcher-grid-apps">
            {BHD_APPS.map((app) => {
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
        <div className="bhd-switcher-card bhd-switcher-account" style={panelStyle ?? undefined} id={accountId} role="dialog" aria-label={t.accountAria}>
          <div className="bhd-switcher-account-row">
            {showPicture ? (
              <img
                src={user.picture || undefined}
                alt=""
                width={44}
                height={44}
                referrerPolicy="no-referrer"
                onError={() => setPictureBroken(true)}
              />
            ) : (
              <span className="bhd-switcher-account-initial">{initial}</span>
            )}
            <AccountIdentity user={user} t={t} />
          </div>
          <a className="bhd-switcher-account-link" href={accountPageUrl(origin)}>
            {t.account}
          </a>
          {otherAccounts.map((item) => (
            <button
              key={item.id || item.email || item.username || item.phone}
              type="button"
              className="bhd-switcher-account-link bhd-switcher-account-switch"
              aria-label={`${t.switchTo} ${accountHandle(item)}`}
              onClick={() => item.id && void onSwitchAccount?.(item.id)}
            >
              <AccountIdentity user={item} t={t} />
            </button>
          ))}
          {onAddAccount ? (
            <button type="button" className="bhd-switcher-account-link" onClick={onAddAccount}>
              {t.addAccount}
            </button>
          ) : null}
          <button type="button" className="bhd-switcher-signout" onClick={() => void onSignOut()}>
            {t.signOut}
          </button>
          {onSignOutAll ? (
            <button type="button" className="bhd-switcher-signout bhd-switcher-signout-all" onClick={() => void onSignOutAll()}>
              {t.signOutAll}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
