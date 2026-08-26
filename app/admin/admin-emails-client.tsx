"use client";

import { FormEvent, useEffect, useState } from "react";
import { Mail, RotateCcw, Save } from "lucide-react";
import { apiFetch } from "../../lib/client-api";
import { clientSignInPath } from "../../lib/client-sign-in";
import { AdminConsole } from "./admin-ui";

type TemplateRow = {
  id: string;
  labelAr: string;
  labelEn: string;
  subjectAr: string;
  subjectEn: string;
  bodyHtmlAr: string;
  bodyHtmlEn: string;
  textAr: string;
  textEn: string;
  customized: boolean;
  updatedAt: string | null;
};

function goToSignIn(path: string) {
  window.location.assign(clientSignInPath(path));
}

export function AdminEmails() {
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState("reset_password");
  const [draft, setDraft] = useState<TemplateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const l = (ar: string, en: string) => (locale === "ar" ? ar : en);

  useEffect(() => {
    const saved = window.localStorage.getItem("wazen-locale");
    if (saved === "en" || saved === "ar") setLocale(saved);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/platform?view=admin&scope=emails", { cache: "no-store", credentials: "same-origin" });
        if (response.status === 401) {
          goToSignIn("/admin/emails");
          return;
        }
        const result = await response.json() as { error?: string; templates?: TemplateRow[] };
        if (!response.ok) throw new Error(result.error ?? "LOAD_FAILED");
        if (cancelled) return;
        const rows = result.templates ?? [];
        setTemplates(rows);
        const initial = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
        setDraft(initial);
        if (initial) setSelectedId(initial.id);
      } catch {
        if (!cancelled) setError(l("تعذر تحميل قوالب البريد.", "Could not load email templates."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const next = templates.find((row) => row.id === selectedId) ?? null;
    setDraft(next ? { ...next } : null);
    setOk("");
    setError("");
  }, [selectedId, templates]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "upsertEmailTemplate",
          idempotencyKey: crypto.randomUUID(),
          id: draft.id,
          subjectAr: draft.subjectAr,
          subjectEn: draft.subjectEn,
          bodyHtmlAr: draft.bodyHtmlAr,
          bodyHtmlEn: draft.bodyHtmlEn,
          textAr: draft.textAr,
          textEn: draft.textEn,
        }),
      });
      const result = await response.json() as { error?: string; templates?: TemplateRow[] };
      if (!response.ok) throw new Error(result.error ?? "SAVE_FAILED");
      setTemplates(result.templates ?? []);
      setOk(l("تم حفظ القالب.", "Template saved."));
    } catch {
      setError(l("تعذر حفظ القالب.", "Could not save template."));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!draft || saving) return;
    if (!window.confirm(l("إعادة القالب للافتراضي؟", "Reset this template to defaults?"))) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      const response = await apiFetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "resetEmailTemplate",
          idempotencyKey: crypto.randomUUID(),
          id: draft.id,
        }),
      });
      const result = await response.json() as { error?: string; templates?: TemplateRow[] };
      if (!response.ok) throw new Error(result.error ?? "RESET_FAILED");
      setTemplates(result.templates ?? []);
      setOk(l("تمت إعادة القالب للافتراضي.", "Template reset to default."));
    } catch {
      setError(l("تعذر إعادة التعيين.", "Could not reset template."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <AdminConsole><p className="admin-loading">{l("جارٍ التحميل…", "Loading…")}</p></AdminConsole>;
  }

  return (
    <AdminConsole>
      <header className="admin-page-head">
        <div>
          <small>{l("الإدارة / رسائل البريد", "Admin / Email templates")}</small>
          <h1>{l("قوالب رسائل وازون", "Wazen email templates")}</h1>
          <p>{l("عدّل نصوص الترحيب والاستعادة والإيصالات. المتغيرات: {{displayName}} {{link}} {{message}} {{messageHtml}}", "Edit welcome, recovery and receipt copy. Placeholders: {{displayName}} {{link}} {{message}} {{messageHtml}}")}</p>
        </div>
      </header>

      <div className="admin-email-layout">
        <aside className="admin-email-list">
          {templates.map((row) => (
            <button
              key={row.id}
              type="button"
              className={row.id === selectedId ? "active" : ""}
              onClick={() => setSelectedId(row.id)}
            >
              <Mail size={16} />
              <span>
                <strong>{locale === "ar" ? row.labelAr : row.labelEn}</strong>
                <small>{row.customized ? l("معدّل", "Custom") : l("افتراضي", "Default")}</small>
              </span>
            </button>
          ))}
        </aside>

        {draft ? (
          <form className="admin-email-editor panel" onSubmit={save}>
            <div className="panel-heading">
              <div>
                <h2>{locale === "ar" ? draft.labelAr : draft.labelEn}</h2>
                <p className="modal-note">{draft.id}{draft.updatedAt ? ` · ${new Date(draft.updatedAt).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB")}` : ""}</p>
              </div>
              <div className="section-title-actions">
                <button type="button" className="secondary-button" onClick={() => void reset()} disabled={saving}><RotateCcw size={15} />{l("افتراضي", "Reset")}</button>
                <button type="submit" className="primary-button" disabled={saving}><Save size={15} />{saving ? l("جارٍ الحفظ…", "Saving…") : l("حفظ", "Save")}</button>
              </div>
            </div>

            <label><span>{l("الموضوع عربي", "Subject AR")}</span><input value={draft.subjectAr} onChange={(event) => setDraft({ ...draft, subjectAr: event.target.value })} required /></label>
            <label><span>{l("الموضوع إنجليزي", "Subject EN")}</span><input value={draft.subjectEn} onChange={(event) => setDraft({ ...draft, subjectEn: event.target.value })} required /></label>
            <label><span>{l("HTML عربي", "HTML AR")}</span><textarea rows={8} value={draft.bodyHtmlAr} onChange={(event) => setDraft({ ...draft, bodyHtmlAr: event.target.value })} required /></label>
            <label><span>{l("HTML إنجليزي", "HTML EN")}</span><textarea rows={8} value={draft.bodyHtmlEn} onChange={(event) => setDraft({ ...draft, bodyHtmlEn: event.target.value })} required /></label>
            <label><span>{l("نص عربي", "Text AR")}</span><textarea rows={4} value={draft.textAr} onChange={(event) => setDraft({ ...draft, textAr: event.target.value })} required /></label>
            <label><span>{l("نص إنجليزي", "Text EN")}</span><textarea rows={4} value={draft.textEn} onChange={(event) => setDraft({ ...draft, textEn: event.target.value })} required /></label>

            {error ? <p className="modal-error">{error}</p> : null}
            {ok ? <p className="modal-note">{ok}</p> : null}
          </form>
        ) : (
          <p className="admin-empty">{error || l("لا توجد قوالب.", "No templates.")}</p>
        )}
      </div>
    </AdminConsole>
  );
}
