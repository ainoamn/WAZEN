"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Search, ShieldCheck, Users } from "lucide-react";
import { AdminShell, ErrorCard, PageLoader, Status, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";

type Row = Record<string, unknown>;

export function AdminUserDetail() {
  const { locale, setLocale, l } = useCommerceLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;
  const [detail, setDetail] = useState<{
    profile: Row;
    sessions: Row[];
    apiKeys: Row[];
    spaces: Row[];
    tenants: Row[];
    audit: Row[];
  } | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/platform?view=admin&scope=users&userId=${encodeURIComponent(userId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.push(`/login?next=${encodeURIComponent(`/admin/users/${userId}`)}`);
          throw new Error("AUTH");
        }
        const result = await response.json() as { error?: string; detail?: typeof detail };
        if (!response.ok) throw new Error(result.error ?? "LOAD");
        return result.detail!;
      })
      .then(setDetail)
      .catch((caught: Error) => setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD"));
  }, [router, userId]);

  useEffect(() => { void load(); }, [load]);

  const revokeSessions = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    try {
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revokeUserSessions", idempotencyKey: crypto.randomUUID(), userId, reason }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "REVOKE_FAILED");
      setReason("");
      void load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REVOKE_FAILED");
    } finally {
      setWorking(false);
    }
  };

  if (error && !detail) {
    return <AdminShell active="users" locale={locale} setLocale={setLocale}><ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} /></AdminShell>;
  }
  if (!detail) return <PageLoader />;
  const profile = detail.profile;

  return (
    <AdminShell active="users" locale={locale} setLocale={setLocale}>
      <div className="admin-page-head">
        <div>
          <small><Link href="/admin/users">{l("المستخدمون", "Users")}</Link> / {String(profile.email)}</small>
          <h1>{String(profile.display_name)}</h1>
          <p>{l("الحساب والجلسات ومفاتيح API والمستأجرون دون انتحال هوية.", "Account, sessions, API keys and tenants — no silent impersonation.")}</p>
        </div>
        <Status value={String(profile.status ?? "active")} locale={locale} />
      </div>

      <div className="admin-kpis">
        <article><i><Users /></i><span>{l("الدور", "Role")}</span><b>{String(profile.role)}</b><small>{String(profile.plan_name_ar ?? profile.plan_name_en ?? "—")}</small></article>
        <article><i><ShieldCheck /></i><span>TOTP</span><b>{Number(profile.totp_enabled) ? l("مفعّل", "On") : l("غير مفعّل", "Off")}</b><small>{String(profile.country ?? "—")}</small></article>
        <article><i><Users /></i><span>{l("جلسات", "Sessions")}</span><b>{detail.sessions.length}</b><small>{l("نشطة/مسجّلة", "recorded")}</small></article>
        <article><i><Users /></i><span>{l("مفاتيح API", "API keys")}</span><b>{detail.apiKeys.length}</b><small>{l("بما فيها الملغاة", "including revoked")}</small></article>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head"><div><h2>{l("إلغاء كل الجلسات", "Revoke all sessions")}</h2><p>{l("يتطلب سبباً ويُسجَّل في التدقيق.", "Requires a reason and writes an audit event.")}</p></div></div>
        <form className="coupon-create" onSubmit={revokeSessions}>
          <input required minLength={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={l("سبب الإلغاء", "Revocation reason")} />
          <button disabled={working}>{l("إلغاء الجلسات", "Revoke sessions")}</button>
        </form>
      </section>

      <div className="admin-overview-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("الجلسات", "Sessions")}</h2></div>
          <div className="audit-list">
            {detail.sessions.map((session) => (
              <div key={String(session.id)}>
                <ShieldCheck />
                <span><b>{String(session.id).slice(0, 8)}…</b><small>{l("آخر ظهور", "Last seen")}: {session.last_seen_at ? new Date(String(session.last_seen_at)).toLocaleString() : "—"}</small></span>
              </div>
            ))}
            {!detail.sessions.length && <p>{l("لا جلسات.", "No sessions.")}</p>}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("مفاتيح API", "API keys")}</h2></div>
          <div className="audit-list">
            {detail.apiKeys.map((key) => (
              <div key={String(key.id)}>
                <ShieldCheck />
                <span><b>{String(key.name)}</b><small>{String(key.key_prefix)}… · {key.revoked_at ? l("ملغى", "revoked") : l("نشط", "active")}</small></span>
              </div>
            ))}
            {!detail.apiKeys.length && <p>{l("لا مفاتيح.", "No API keys.")}</p>}
          </div>
        </section>
      </div>

      <div className="admin-overview-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("المحافظ المملوكة", "Owned wallets")}</h2></div>
          <div className="audit-list">
            {detail.spaces.map((space) => (
              <div key={String(space.id)}><Users /><span><b>{String(space.name_ar ?? space.name_en)}</b><small>{String(space.type)} · {String(space.currency)}</small></span></div>
            ))}
            {!detail.spaces.length && <p>{l("لا محافظ.", "No wallets.")}</p>}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("المستأجرون", "Tenants")}</h2></div>
          <div className="audit-list">
            {detail.tenants.map((tenant) => (
              <div key={String(tenant.tenant_id)}>
                <Users />
                <span>
                  <b><Link href={`/admin/tenants/${encodeURIComponent(String(tenant.tenant_id))}`}>{String(tenant.tenant_name)}</Link></b>
                  <small>{String(tenant.role)} · {String(tenant.country)}</small>
                </span>
              </div>
            ))}
            {!detail.tenants.length && <p>{l("لا مستأجرين.", "No tenants.")}</p>}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

export function AdminTenants() {
  const { locale, setLocale, l } = useCommerceLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; total: number; page: number; pageSize: number } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({ scope: "tenants", view: "admin", page: String(page), pageSize: "25" });
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/platform?${params}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.push("/login?next=/admin/tenants");
          throw new Error("AUTH");
        }
        const result = await response.json() as { error?: string; tenantsPage?: typeof data };
        if (!response.ok) throw new Error(result.error ?? "LOAD");
        return result.tenantsPage!;
      })
      .then(setData)
      .catch((caught: Error) => setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD"));
  }, [page, query, router]);

  useEffect(() => { void load(); }, [load]);

  if (error && !data) {
    return <AdminShell active="tenants" locale={locale} setLocale={setLocale}><ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} /></AdminShell>;
  }
  if (!data) return <PageLoader />;

  return (
    <AdminShell active="tenants" locale={locale} setLocale={setLocale}>
      <div className="admin-page-head">
        <div>
          <small>{l("الإدارة / المستأجرون", "Admin / Tenants")}</small>
          <h1>{l("الشركات والمستأجرون", "Companies & tenants")}</h1>
          <p>{l("عرض المالك والأعضاء والاستخدام دون انتحال صامت.", "Owner, members and usage — no silent impersonation.")}</p>
        </div>
      </div>
      <section className="admin-panel admin-table-panel">
        <div className="admin-filters">
          <label><Search /><input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder={l("بحث بالاسم أو البريد…", "Search name or email…")} /></label>
        </div>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{l("المستأجر", "Tenant")}</th>
                <th>{l("المالك", "Owner")}</th>
                <th>{l("الدولة", "Country")}</th>
                <th>{l("أعضاء", "Members")}</th>
                <th>{l("محافظ", "Spaces")}</th>
                <th>{l("تفاصيل", "Details")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((tenant) => (
                <tr key={String(tenant.id)}>
                  <td><b>{String(tenant.name)}</b><small>{String(tenant.id)}</small></td>
                  <td><b>{String(tenant.owner_name ?? "—")}</b><small>{String(tenant.owner_email ?? "")}</small></td>
                  <td>{String(tenant.country)} · {String(tenant.currency)}</td>
                  <td>{String(tenant.member_count)}</td>
                  <td>{String(tenant.space_count)}</td>
                  <td><Link href={`/admin/tenants/${encodeURIComponent(String(tenant.id))}`}>{l("فتح", "Open")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-filters" style={{ marginTop: 12 }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{l("السابق", "Prev")}</button>
          <span>{l("صفحة", "Page")} {data.page} · {data.total} {l("إجمالي", "total")}</span>
          <button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)}>{l("التالي", "Next")}</button>
        </div>
      </section>
    </AdminShell>
  );
}

export function AdminTenantDetail() {
  const { locale, setLocale, l } = useCommerceLocale();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tenantId = decodeURIComponent(params.id);
  const [detail, setDetail] = useState<{ tenant: Row; members: Row[]; resources: Row[] } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch(`/api/platform?view=admin&scope=tenants&tenantId=${encodeURIComponent(tenantId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.push(`/login?next=${encodeURIComponent(`/admin/tenants/${tenantId}`)}`);
          throw new Error("AUTH");
        }
        const result = await response.json() as { error?: string; detail?: typeof detail };
        if (!response.ok) throw new Error(result.error ?? "LOAD");
        return result.detail!;
      })
      .then(setDetail)
      .catch((caught: Error) => setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD"));
  }, [router, tenantId]);

  useEffect(() => { void load(); }, [load]);

  if (error && !detail) {
    return <AdminShell active="tenants" locale={locale} setLocale={setLocale}><ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} /></AdminShell>;
  }
  if (!detail) return <PageLoader />;

  return (
    <AdminShell active="tenants" locale={locale} setLocale={setLocale}>
      <div className="admin-page-head">
        <div>
          <small><Link href="/admin/tenants">{l("المستأجرون", "Tenants")}</Link> / {String(detail.tenant.id)}</small>
          <h1>{String(detail.tenant.name)}</h1>
          <p>{l("تفاصيل الشركة والأعضاء والموارد المرتبطة.", "Company details, members and linked resources.")}</p>
        </div>
      </div>
      <div className="admin-kpis">
        <article><i><Users /></i><span>{l("المالك", "Owner")}</span><b>{String(detail.tenant.owner_name ?? "—")}</b><small>{String(detail.tenant.owner_email ?? "")}</small></article>
        <article><i><Users /></i><span>{l("الدولة", "Country")}</span><b>{String(detail.tenant.country)}</b><small>{String(detail.tenant.currency)}</small></article>
        <article><i><Users /></i><span>{l("الأعضاء", "Members")}</span><b>{detail.members.length}</b><small>{l("نشطون/مسجّلون", "recorded")}</small></article>
        <article><i><Users /></i><span>{l("الموارد", "Resources")}</span><b>{detail.resources.length}</b><small>{l("حتى 100", "up to 100")}</small></article>
      </div>
      <div className="admin-overview-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("الأعضاء", "Members")}</h2></div>
          <div className="audit-list">
            {detail.members.map((member) => (
              <div key={String(member.user_id)}>
                <Users />
                <span>
                  <b><Link href={`/admin/users/${encodeURIComponent(String(member.user_id))}`}>{String(member.display_name ?? member.email)}</Link></b>
                  <small>{String(member.role)} · {String(member.status)}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><h2>{l("الموارد", "Resources")}</h2></div>
          <div className="audit-list">
            {detail.resources.map((resource) => (
              <div key={`${resource.resource_type}:${resource.resource_id}`}>
                <Users />
                <span><b>{String(resource.resource_type)}</b><small>{String(resource.resource_id)}</small></span>
              </div>
            ))}
            {!detail.resources.length && <p>{l("لا موارد.", "No resources.")}</p>}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

export function AdminStaff() {
  const { locale, setLocale, l } = useCommerceLocale();
  const router = useRouter();
  const [roles, setRoles] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setRoles(null);
    fetch("/api/platform?view=admin&scope=overview", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.push("/login?next=/admin/staff");
          throw new Error("AUTH");
        }
        const result = await response.json() as { error?: string; roles?: Row[] };
        if (!response.ok) throw new Error(result.error ?? "LOAD");
        return (result.roles ?? []).filter((row) => String(row.role) !== "customer");
      })
      .then(setRoles)
      .catch((caught: Error) => setError(caught.message === "FORBIDDEN" ? "FORBIDDEN" : "LOAD"));
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  if (error && !roles) {
    return <AdminShell active="staff" locale={locale} setLocale={setLocale}><ErrorCard message={error === "FORBIDDEN" ? l("لا تملك صلاحية", "Forbidden") : l("تعذر التحميل", "Load failed")} retry={load} /></AdminShell>;
  }
  if (!roles) return <PageLoader />;

  return (
    <AdminShell active="staff" locale={locale} setLocale={setLocale}>
      <div className="admin-page-head">
        <div>
          <small>{l("الإدارة / الفريق", "Admin / Staff")}</small>
          <h1>{l("فريق الإدارة والصلاحيات", "Admin staff & roles")}</h1>
          <p>{l("عرض الأدوار الحالية. دعوات الموظفين ومصفوفة الصلاحيات الكاملة تُستكمل لاحقاً.", "Current roles. Staff invites and full permission matrix come next.")}</p>
        </div>
      </div>
      <section className="admin-panel">
        <div className="admin-panel-head"><h2>{l("الأدوار النشطة", "Active roles")}</h2></div>
        <div className="role-list">
          {roles.map((row) => (
            <div key={String(row.user_id)}>
              <i><ShieldCheck /></i>
              <span>
                <b><Link href={`/admin/users/${encodeURIComponent(String(row.user_id))}`}>{String(row.display_name ?? row.email ?? row.user_id)}</Link></b>
                <small>{String(row.email ?? "")}</small>
              </span>
              <code>{String(row.role)}</code>
            </div>
          ))}
          {!roles.length && <p>{l("لا يوجد موظفون إداريون بعد. أنشئ المدير عبر bootstrap.", "No admin staff yet. Bootstrap the first admin.")}</p>}
        </div>
        <p className="modal-note" style={{ marginTop: 16 }}>
          {l(
            "التهيئة الآمنة: npm run provision:production بعد توفير TURSO_API_TOKEN و TURSO_ORG، ثم /admin/setup.",
            "Safe bootstrap: npm run provision:production after TURSO_API_TOKEN + TURSO_ORG, then /admin/setup.",
          )}
        </p>
      </section>
    </AdminShell>
  );
}
