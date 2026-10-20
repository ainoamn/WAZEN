export type BhdAppMode = "identity" | "sso" | "browse";

export type BhdApp = {
  id: string;
  clientId: string | null;
  nameAr: string;
  nameEn: string;
  origin: string;
  /** مسار نسبي داخل المنتج بعد SSO — مساحة عمل العميل وليس الصفحة التسويقية. */
  workspacePath: string;
  startUrl: string | null;
  mode: BhdAppMode;
  enabled: boolean;
  mark: string;
  accent: string;
  soft: string;
};

export const BHD_APP_SWITCHER_SPEC = "bhd-appswitcher.v1";

function ssoStart(origin: string, workspacePath: string) {
  const path = workspacePath.startsWith("/") ? workspacePath : `/${workspacePath}`;
  return `${origin.replace(/\/$/, "")}/api/auth/bhd/start?returnTo=${encodeURIComponent(path)}`;
}

/**
 * كتالوج مجمد — يُنسخ حرفياً إلى كل منتجات BHD.
 * workspacePath = لوحة العميل بعد التعرّف عبر الهوية (ليس /admin إلا للمكتب الداخلي).
 * النقر يفتح workspacePath مباشرة. start فقط إن لم توجد جلسة منتج (ميدلوير المنتج).
 * انظر docs/BHD-PRODUCT-SSO-ADMIN.md وdocs/BHD-APP-SWITCHER.md
 */
export const BHD_APPS: BhdApp[] = [
  {
    id: "account",
    clientId: null,
    nameAr: "الحساب",
    nameEn: "Account",
    origin: "https://id.bhd-om.com",
    workspacePath: "/account",
    startUrl: null,
    mode: "identity",
    enabled: true,
    mark: "حـ",
    accent: "#092d24",
    soft: "#e8f4f1",
  },
  {
    id: "portal",
    clientId: "bhd-portal",
    nameAr: "بوابة بن حمود",
    nameEn: "Bin Hamood Portal",
    origin: "https://www.bhd-om.com",
    workspacePath: "/company",
    startUrl: ssoStart("https://www.bhd-om.com", "/company"),
    mode: "sso",
    enabled: true,
    mark: "B",
    accent: "#075c45",
    soft: "#e6f1ec",
  },
  {
    id: "wazen",
    clientId: "bhd-wazen",
    nameAr: "وازن",
    nameEn: "WAZEN",
    origin: "https://wazen.bhd-om.com",
    workspacePath: "/dashboard",
    startUrl: ssoStart("https://wazen.bhd-om.com", "/dashboard"),
    mode: "sso",
    enabled: true,
    mark: "و",
    accent: "#126b63",
    soft: "#e8f4f1",
  },
  {
    id: "hisaby",
    clientId: "bhd-hisaby",
    nameAr: "حسابي",
    nameEn: "HISAB",
    origin: "https://hisaby.bhd-om.com",
    workspacePath: "/dashboard",
    startUrl: ssoStart("https://hisaby.bhd-om.com", "/dashboard"),
    mode: "sso",
    enabled: true,
    mark: "ح",
    accent: "#075c45",
    soft: "#e6f1ec",
  },
  {
    id: "nasab",
    clientId: "bhd-nasab",
    nameAr: "نَسَب",
    nameEn: "NASAB",
    origin: "https://nasab.bhd-om.com",
    workspacePath: "/app",
    startUrl: ssoStart("https://nasab.bhd-om.com", "/app"),
    mode: "sso",
    enabled: true,
    mark: "ن",
    accent: "#8a3c45",
    soft: "#f6e9eb",
  },
  {
    id: "bhd-r",
    clientId: "bhd-r",
    nameAr: "BHD R",
    nameEn: "BHD R",
    origin: "https://r.bhd-om.com",
    workspacePath: "/ar/portal",
    startUrl: ssoStart("https://r.bhd-om.com", "/ar/portal"),
    mode: "sso",
    enabled: true,
    mark: "R",
    accent: "#a66b2d",
    soft: "#f8efe4",
  },
  {
    id: "store",
    clientId: "bhd-store",
    nameAr: "المتجر",
    nameEn: "BHD Store",
    origin: "https://bhdstor.bhd-om.com",
    workspacePath: "/dashboard",
    startUrl: ssoStart("https://bhdstor.bhd-om.com", "/dashboard"),
    mode: "sso",
    enabled: true,
    mark: "م",
    accent: "#315d89",
    soft: "#e9f0f7",
  },
  {
    id: "office",
    clientId: "bhd-office",
    nameAr: "المكتب",
    nameEn: "BHD Office",
    origin: "https://baitak.bhd-om.com",
    workspacePath: "/ar",
    startUrl: ssoStart("https://baitak.bhd-om.com", "/ar"),
    mode: "sso",
    enabled: true,
    mark: "B",
    accent: "#283b4d",
    soft: "#e9edf0",
  },
];

export function gatewayApps(): BhdApp[] {
  return BHD_APPS.filter((app) => app.enabled && app.id !== "account");
}

function samePortalOrigin(pageOrigin?: string) {
  if (!pageOrigin) return false;
  const here = pageOrigin.replace(/\/$/, "");
  return (
    here === "https://www.bhd-om.com" ||
    here === "https://bhd-om.com" ||
    here.endsWith(".vercel.app") ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(here)
  );
}

function stripOrigin(value: string) {
  return value.replace(/\/$/, "");
}

/** مساحة العمل مباشرة — للميدلوير وprefetch عندما تكون جلسة المنتج قائمة. */
export function workspaceUrlForApp(app: BhdApp, pageOrigin?: string): string {
  if (app.mode === "identity") {
    if (pageOrigin) {
      const here = stripOrigin(pageOrigin);
      if (here === "https://id.bhd-om.com" || samePortalOrigin(pageOrigin)) return app.workspacePath;
    }
    return `${stripOrigin(app.origin)}${app.workspacePath}`;
  }
  if (app.id === "portal" && samePortalOrigin(pageOrigin)) {
    return app.workspacePath;
  }
  if (app.origin) {
    return `${stripOrigin(app.origin)}${app.workspacePath || "/"}`;
  }
  return app.workspacePath || "/";
}

/**
 * رابط النقر من المشغّل.
 * - نفس المنشأ: مساحة العمل (الميدلوير → start فقط إن لزم).
 * - منتج SSO آخر: start الصامت حتى تُعاد استخدام جلسة الهوية بلا نموذج دخول.
 * انظر BHD-APP-SWITCHER §0.4 / §3 وBHD-SESSION-POLICY «تنقّل صامت».
 */
export function launchUrlForApp(app: BhdApp, pageOrigin?: string): string {
  if (app.mode === "identity") {
    return workspaceUrlForApp(app, pageOrigin);
  }
  if (app.mode === "browse" || !app.startUrl) {
    return app.origin ? `${stripOrigin(app.origin)}/` : workspaceUrlForApp(app, pageOrigin);
  }
  if (pageOrigin && stripOrigin(pageOrigin) === stripOrigin(app.origin)) {
    return workspaceUrlForApp(app, pageOrigin);
  }
  if (app.id === "portal" && samePortalOrigin(pageOrigin)) {
    return workspaceUrlForApp(app, pageOrigin);
  }
  return app.startUrl;
}

export function startUrlForApp(app: BhdApp): string | null {
  return app.startUrl;
}

export function hopOrigins(): string[] {
  return [...new Set(BHD_APPS.filter((app) => app.enabled && app.origin).map((app) => app.origin.replace(/\/$/, "")))];
}
