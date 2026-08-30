"use client";

import { HelpCircle, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../lib/client-api";
import {
  CONFIGURABLE_SPACE_ROLES,
  clientSpaceRolePermissions,
  parseSpaceRolePermissions,
  spaceRoleLabel,
  type RoleTxnPermissions,
  type SpaceRolePermissionsMap,
} from "../../lib/space-role-permissions";

type Locale = "ar" | "en";

const ACTION_LABELS = {
  ar: { view: "مشاهدة", add: "إضافة", edit: "تعديل", delete: "حذف" },
  en: { view: "View", add: "Add", edit: "Edit", delete: "Delete" },
} as const;

export function SpaceRolesHelpButton({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={locale === "ar" ? "شرح الأدوار والصلاحيات" : "Explain roles and permissions"}
        title={locale === "ar" ? "ما فائدة الأدوار؟" : "Why roles?"}
        onClick={() => setOpen(true)}
      >
        <HelpCircle size={18} />
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="modal-card" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2>{locale === "ar" ? "أدوار الأعضاء والصلاحيات" : "Member roles & permissions"}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button>
            </div>
            <div className="modal-form">
              <p className="modal-note">
                {locale === "ar"
                  ? "تحدد الأدوار من يستطيع إضافة أو تعديل أو حذف العمليات، وتمنع العضو من تعديل عملية أنشأها مدير أو مسؤول أعلى منه. المدير يضبط الصلاحيات من إعدادات الجمعية."
                  : "Roles control who can add, edit, or delete transactions, and stop a member from changing a post created by a manager or higher role. The manager sets permissions in association settings."}
              </p>
              <ul className="modal-note" style={{ paddingInlineStart: "1.2rem", display: "grid", gap: "0.5rem" }}>
                <li><strong>{spaceRoleLabel("manager", locale)}</strong> — {locale === "ar" ? "إدارة كاملة: إضافة وتعديل وحذف، وضبط صلاحيات الأدوار." : "Full control: add, edit, delete, and configure role permissions."}</li>
                <li><strong>{spaceRoleLabel("supervisor", locale)}</strong> — {locale === "ar" ? "متابعة وإضافة وتعديل؛ الحذف اختياري حسب الإعداد." : "Oversee, add, and edit; delete depends on settings."}</li>
                <li><strong>{spaceRoleLabel("treasurer", locale)}</strong> — {locale === "ar" ? "غالباً إضافة وحذف للعمليات المالية دون تعديل قيود أعلى." : "Usually add and delete financial entries without editing higher posts."}</li>
                <li><strong>{spaceRoleLabel("member", locale)}</strong> — {locale === "ar" ? "مشاهدة افتراضياً؛ يمكن منحه الإضافة إن سمح المدير." : "View by default; may add if the manager grants it."}</li>
              </ul>
              <p className="modal-hint">
                {locale === "ar"
                  ? "قاعدة الحماية: لا يعدّل عضو عملية أنشأها دور أعلى منه، حتى لو مُنح صلاحية التعديل."
                  : "Protection rule: a member cannot edit a transaction created by a higher role, even if they have edit permission."}
              </p>
              <div className="modal-actions">
                <button type="button" className="primary-button" onClick={() => setOpen(false)}>{locale === "ar" ? "حسناً" : "Got it"}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function SpaceRolePermissionsPanel({
  spaceId,
  locale,
  rolePermissionsJson,
  canManage,
  onSaved,
}: {
  spaceId: string;
  locale: Locale;
  rolePermissionsJson?: string | null;
  canManage: boolean;
  onSaved: (nextJson: string) => void;
}) {
  const [map, setMap] = useState<SpaceRolePermissionsMap>(() => clientSpaceRolePermissions({ role_permissions_json: rolePermissionsJson }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setMap(clientSpaceRolePermissions({ role_permissions_json: rolePermissionsJson }));
  }, [rolePermissionsJson, spaceId]);

  const toggle = (role: string, action: keyof RoleTxnPermissions) => {
    if (!canManage) return;
    setMap((current) => ({
      ...current,
      [role]: { ...current[role], [action]: !current[role]?.[action] },
    }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage || saving) return;
    setSaving(true);
    setError("");
    setNote("");
    try {
      const permissions = {
        manager: map.manager,
        supervisor: map.supervisor,
        treasurer: map.treasurer,
        member: map.member,
      };
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "updateSpaceRolePermissions",
          idempotencyKey: crypto.randomUUID(),
          spaceId,
          permissions,
        }),
      });
      const result = await response.json() as { error?: string; role_permissions_json?: string };
      if (!response.ok) throw new Error(result.error ?? "SAVE_FAILED");
      const next = result.role_permissions_json ?? JSON.stringify(permissions);
      setMap(parseSpaceRolePermissions(next));
      onSaved(next);
      setNote(locale === "ar" ? "تم حفظ صلاحيات الأدوار." : "Role permissions saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "ar" ? "تعذر الحفظ." : "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  const labels = ACTION_LABELS[locale];

  return (
    <article className="panel workflow-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">{locale === "ar" ? "صلاحيات الأدوار" : "Role permissions"}</span>
          <h2>{locale === "ar" ? "من يعدّل العمليات؟" : "Who can change transactions?"}</h2>
        </div>
        <SpaceRolesHelpButton locale={locale} />
      </div>
      <p className="modal-note">
        {locale === "ar"
          ? "اضبط لكل دور: مشاهدة، إضافة، تعديل، حذف. لا يمكن لأي عضو تعديل عملية أنشأها دور أعلى."
          : "Set view, add, edit, and delete per role. No one can edit a transaction created by a higher role."}
      </p>
      <form onSubmit={save}>
        <div className="members-table role-permissions-table">
          <div className="table-head">
            <span>{locale === "ar" ? "الدور" : "Role"}</span>
            <span>{labels.view}</span>
            <span>{labels.add}</span>
            <span>{labels.edit}</span>
            <span>{labels.delete}</span>
          </div>
          {CONFIGURABLE_SPACE_ROLES.map((role) => {
            const row = map[role];
            return (
              <div className="member-row" key={role}>
                <strong>{spaceRoleLabel(role, locale)}</strong>
                {(["view", "add", "edit", "delete"] as const).map((action) => (
                  <label key={action} className="role-perm-check">
                    <input
                      type="checkbox"
                      checked={Boolean(row?.[action])}
                      disabled={!canManage || (action === "view" && role === "manager")}
                      onChange={() => toggle(role, action)}
                    />
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        {error ? <p className="modal-error">{error}</p> : null}
        {note ? <p className="modal-note">{note}</p> : null}
        {canManage ? (
          <div className="modal-actions" style={{ marginTop: "0.75rem" }}>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : (locale === "ar" ? "حفظ الصلاحيات" : "Save permissions")}
            </button>
          </div>
        ) : (
          <p className="modal-hint">{locale === "ar" ? "المالك أو المدير فقط يعدّل هذه الإعدادات." : "Only the owner or manager can change these settings."}</p>
        )}
      </form>
    </article>
  );
}
