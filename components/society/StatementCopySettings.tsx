"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch } from "../../lib/client-api";
import {
  STATEMENT_COPY_FIELD_META,
  STATEMENT_COPY_MAX_LEN,
  defaultStatementCopy,
  effectiveStatementCopy,
  parseSpaceStatementCopy,
  type StatementCopyLocale,
} from "../../lib/statement-copy";

type Locale = "ar" | "en";

type SpaceOption = {
  id: string;
  name_ar: string;
  name_en: string;
  type: string;
  statement_copy_json?: string | null;
};

export function StatementCopySettings({
  locale,
  spaces,
  onSaved,
}: {
  locale: Locale;
  spaces: SpaceOption[];
  onSaved: (spaceId: string, statement_copy_json: string) => void;
}) {
  const societySpaces = useMemo(
    () => spaces.filter((space) => space.type === "society" || space.type === "group"),
    [spaces],
  );
  const [spaceId, setSpaceId] = useState(societySpaces[0]?.id ?? "");
  const selected = societySpaces.find((space) => space.id === spaceId) ?? societySpaces[0];
  const [fields, setFields] = useState<StatementCopyLocale>(() => defaultStatementCopy(locale));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selected) return;
    setFields(effectiveStatementCopy(parseSpaceStatementCopy(selected.statement_copy_json), locale));
    setMsg("");
    setError("");
  }, [selected?.id, selected?.statement_copy_json, locale]);

  useEffect(() => {
    if (!spaceId && societySpaces[0]?.id) setSpaceId(societySpaces[0].id);
  }, [societySpaces, spaceId]);

  if (!societySpaces.length) {
    return (
      <article className="panel">
        <h2>{locale === "ar" ? "عبارات كشوف الجمعية" : "Society statement wording"}</h2>
        <p className="modal-note">
          {locale === "ar"
            ? "أنشئ جمعية أو مجموعة أولاً لتخصيص مقدمات الكشوف ورسائل واتساب."
            : "Create a society or group first to customize statement intros and WhatsApp lines."}
        </p>
      </article>
    );
  }

  const spaceName = locale === "ar" ? selected!.name_ar : selected!.name_en;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "saveSpaceStatementCopy",
          idempotencyKey: crypto.randomUUID(),
          spaceId: selected.id,
          copy: { [locale]: fields },
        }),
      });
      const result = await response.json() as { error?: string; statement_copy_json?: string };
      if (!response.ok) {
        const code = result.error ?? "INVALID_STATEMENT_COPY";
        throw new Error(
          code === "FORBIDDEN"
            ? (locale === "ar" ? "لا تملك صلاحية تعديل عبارات هذه الجمعية." : "You cannot edit wording for this association.")
            : code === "INVALID_STATEMENT_COPY"
              ? (locale === "ar" ? `تحقق من طول العبارات (حتى ${STATEMENT_COPY_MAX_LEN} حرفاً لكل حقل).` : `Check wording length (max ${STATEMENT_COPY_MAX_LEN} characters per field).`)
              : code,
        );
      }
      onSaved(selected.id, String(result.statement_copy_json ?? "{}"));
      setMsg(locale === "ar"
        ? "تم حفظ العبارات — ستظهر في الطباعة ورابط الكشف وواتساب."
        : "Saved — wording applies to print, share links, and WhatsApp.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "ar" ? "تعذر الحفظ." : "Could not save."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <h2>{locale === "ar" ? "عبارات كشوف الجمعية" : "Society statement wording"}</h2>
          <p className="modal-note">
            {locale === "ar"
              ? "هذه الرسائل الافتراضية الرسمية للجمعيات — عدّلوها كما تشاؤون. {{spaceName}} = اسم الجمعية، واختيارياً {{statementUrl}} داخل رسالة واتساب."
              : "These are the official default society letters — edit freely. {{spaceName}} = association name; optional {{statementUrl}} inside WhatsApp text."}
          </p>
        </div>
      </div>
      <form className="statement-copy-form" onSubmit={(event) => void save(event)}>
        <label>
          <span>{locale === "ar" ? "الجمعية" : "Association"}</span>
          <select
            value={selected!.id}
            onChange={(event) => setSpaceId(event.target.value)}
          >
            {societySpaces.map((space) => (
              <option key={space.id} value={space.id}>
                {locale === "ar" ? space.name_ar : space.name_en}
              </option>
            ))}
          </select>
        </label>
        <p className="modal-note">
          {locale === "ar"
            ? `معاينة الاسم: «${spaceName}» · حتى ${STATEMENT_COPY_MAX_LEN} حرفاً لكل حقل.`
            : `Name preview: “${spaceName}” · up to ${STATEMENT_COPY_MAX_LEN} characters per field.`}
        </p>
        {STATEMENT_COPY_FIELD_META.map((field) => (
          <label key={field.key}>
            <span>{locale === "ar" ? field.ar : field.en}</span>
            <textarea
              rows={field.key.startsWith("whatsapp") ? 12 : 7}
              maxLength={STATEMENT_COPY_MAX_LEN}
              value={fields[field.key]}
              onChange={(event) => setFields((prev) => ({ ...prev, [field.key]: event.target.value }))}
            />
          </label>
        ))}
        {error ? <p className="modal-error">{error}</p> : null}
        {msg ? <p className="modal-note" role="status">{msg}</p> : null}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => setFields(defaultStatementCopy(locale))}
          >
            {locale === "ar" ? "استعادة الافتراضي" : "Reset defaults"}
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : (locale === "ar" ? "حفظ العبارات" : "Save wording")}
          </button>
        </div>
      </form>
    </article>
  );
}
