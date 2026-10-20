"use client";

import { Download, Upload, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { apiFetch } from "../../lib/client-api";
import {
  parseSocietyImportPack,
  societyExpensesTemplateCsv,
  societyMembersTemplateCsv,
  societyPackExampleJson,
  societyPaymentsTemplateCsv,
  type SocietyImportPack,
} from "../../lib/society-import";

type Locale = "ar" | "en";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card wide-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function downloadText(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SocietyImportModal({
  locale,
  preferredSpaceId,
  onClose,
  onDone,
}: {
  locale: Locale;
  preferredSpaceId?: string;
  onClose: () => void;
  onDone: (message: string, spaceId: string) => void;
}) {
  const [pack, setPack] = useState<SocietyImportPack | null>(null);
  const [fileName, setFileName] = useState("");
  const [intoExisting, setIntoExisting] = useState(Boolean(preferredSpaceId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (file: File | null) => {
    setError("");
    setPack(null);
    setFileName("");
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseSocietyImportPack(JSON.parse(text));
      if (intoExisting && preferredSpaceId) parsed.spaceId = preferredSpaceId;
      else delete parsed.spaceId;
      setPack(parsed);
      setFileName(file.name);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "INVALID_PACK";
      const ar: Record<string, string> = {
        INVALID_PACK: "ملف الحزمة غير صالح.",
        INVALID_SPACE_NAME: "اسم الجمعية ناقص.",
        INVALID_MEMBERS: "قائمة الأعضاء فارغة أو غير صالحة.",
        TOO_MANY_MEMBERS: "عدد الأعضاء يتجاوز الحد المسموح.",
        TOO_MANY_PAYMENTS: "عدد المدفوعات كبير جداً.",
        TOO_MANY_EXPENSES: "عدد المصروفات كبير جداً.",
      };
      setError(locale === "ar" ? (ar[code] ?? "تعذر قراءة ملف JSON.") : code);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pack) {
      setError(locale === "ar" ? "اختر ملف الحزمة أولاً." : "Choose a pack file first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: SocietyImportPack = {
        ...pack,
        spaceId: intoExisting && preferredSpaceId ? preferredSpaceId : undefined,
      };
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 110_000);
      let response: Response;
      try {
        response = await apiFetch("/api/dashboard", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            action: "importSocietyPack",
            idempotencyKey: crypto.randomUUID(),
            pack: payload,
          }),
        });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          throw new Error(locale === "ar"
            ? "انتهت مهلة الاستيراد. حدّث الصفحة وتحقق إن ظهرت الجمعية، أو أعد المحاولة."
            : "Import timed out. Refresh to check if the society appeared, or try again.");
        }
        throw caught;
      } finally {
        window.clearTimeout(timeout);
      }
      const result = await response.json() as {
        error?: string;
        spaceId?: string;
        spaceName?: string;
        membersCreated?: number;
        paymentsPosted?: number;
        expensesPosted?: number;
        holdingsPosted?: number;
        openingPosted?: boolean;
        unmatchedPayments?: string[];
      };
      if (!response.ok) {
        const messages: Record<string, string> = locale === "ar"
          ? {
            PLAN_FEATURE_REQUIRED: "باقتك لا تسمح بإنشاء جمعية.",
            PLAN_WALLET_LIMIT: "وصلت إلى حد المحافظ.",
            PLAN_MEMBER_LIMIT: "تجاوزت حد الأعضاء.",
            INVALID_PACK: "ملف الحزمة غير صالح.",
            FORBIDDEN: "ليست لديك صلاحية الاستيراد.",
          }
          : {
            PLAN_FEATURE_REQUIRED: "Your plan does not allow societies.",
            PLAN_WALLET_LIMIT: "Wallet limit reached.",
            PLAN_MEMBER_LIMIT: "Member limit exceeded.",
            INVALID_PACK: "Invalid pack file.",
            FORBIDDEN: "You cannot import into this wallet.",
          };
        throw new Error(messages[result.error ?? ""] ?? result.error ?? "IMPORT_FAILED");
      }
      const unmatched = result.unmatchedPayments?.length
        ? (locale === "ar"
          ? ` · لم تُطابق ${result.unmatchedPayments.length} دفعة`
          : ` · ${result.unmatchedPayments.length} unmatched payments`)
        : "";
      onDone(
        locale === "ar"
          ? `استوردت «${result.spaceName}»: ${result.membersCreated} عضو، ${result.paymentsPosted} دفعة، ${result.expensesPosted} مصروف، ${result.holdingsPosted ?? 0} وديعة/استثمار${result.openingPosted ? "، ورصيد افتتاحي" : ""}${unmatched}`
          : `Imported “${result.spaceName}”: ${result.membersCreated} members, ${result.paymentsPosted} payments, ${result.expensesPosted} expenses, ${result.holdingsPosted ?? 0} holdings${result.openingPosted ? ", opening balance" : ""}${unmatched}`,
        result.spaceId ?? "",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "IMPORT_FAILED");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={locale === "ar" ? "استيراد حزمة جمعية" : "Import society pack"} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <p className="modal-note">
          {locale === "ar"
            ? "ارفع ملف JSON الجاهز (أعضاء + مدفوعات + مصروفات + رصيد افتتاحي) دفعة واحدة. ملف إكسل الأصلي لا يُرفع مباشرة — استخدم الحزمة المحوّلة."
            : "Upload a prepared JSON pack (members + payments + expenses + opening balance) in one shot. Raw Excel is not accepted — use the converted pack."}
        </p>
        {preferredSpaceId ? (
          <div className="segmented-control">
            <button type="button" className={!intoExisting ? "active" : ""} onClick={() => setIntoExisting(false)}>
              {locale === "ar" ? "جمعية جديدة" : "New society"}
            </button>
            <button type="button" className={intoExisting ? "active" : ""} onClick={() => setIntoExisting(true)}>
              {locale === "ar" ? "إلى الجمعية الحالية" : "Into current society"}
            </button>
          </div>
        ) : null}
        <label>
          <span>{locale === "ar" ? "ملف الحزمة (.json)" : "Pack file (.json)"}</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {pack ? (
          <div className="modal-note split-preview">
            <span>{fileName || pack.spaceName}</span>
            <strong>
              {pack.spaceName}
              {" · "}
              {pack.members.length} {locale === "ar" ? "عضو" : "members"}
              {" · "}
              {pack.payments?.length ?? 0} {locale === "ar" ? "دفعة" : "payments"}
              {" · "}
              {pack.expenses?.length ?? 0} {locale === "ar" ? "مصروف" : "expenses"}
              {" · "}
              {pack.holdings?.length ?? 0} {locale === "ar" ? "وديعة/استثمار" : "holdings"}
              {pack.openingBalance ? ` · ${locale === "ar" ? "افتتاحي" : "opening"} ${pack.openingBalance.amount}` : ""}
            </strong>
            {pack.members.length <= 2 && Number(pack.openingBalance?.amount ?? 0) === 100 ? (
              <p className="modal-error" style={{ marginTop: 8 }}>
                {locale === "ar"
                  ? "هذا يبدو ملف المثال التجريبي وليس حزمة أبناء خلفان (51 عضواً). اختر الملف الصحيح من التنزيلات."
                  : "This looks like the demo example, not a full society pack. Pick the correct file from Downloads."}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="form-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => downloadText("مثال-حزمة-تجريبية-لا-ترفعه-لأبناء-خلفان.json", societyPackExampleJson(), "application/json")}
          >
            <Download size={14} />{locale === "ar" ? "مثال JSON (تجريبي)" : "JSON example (demo)"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => downloadText("wazen-members.csv", societyMembersTemplateCsv(), "text/csv;charset=utf-8")}
          >
            <Download size={14} />{locale === "ar" ? "قالب أعضاء" : "Members CSV"}
          </button>
        </div>
        <div className="form-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => downloadText("wazen-payments.csv", societyPaymentsTemplateCsv(), "text/csv;charset=utf-8")}
          >
            <Download size={14} />{locale === "ar" ? "قالب مدفوعات" : "Payments CSV"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => downloadText("wazen-expenses.csv", societyExpensesTemplateCsv(), "text/csv;charset=utf-8")}
          >
            <Download size={14} />{locale === "ar" ? "قالب مصروفات" : "Expenses CSV"}
          </button>
        </div>
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            {locale === "ar" ? "إلغاء" : "Cancel"}
          </button>
          <button className="primary-button" disabled={saving || !pack}>
            <Upload size={16} />
            {saving
              ? (locale === "ar" ? "جاري الاستيراد…" : "Importing…")
              : (locale === "ar" ? "استيراد دفعة واحدة" : "Import in one batch")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
