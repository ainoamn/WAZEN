"use client";

import { Download, Mail, Phone, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { apiFetch } from "../../lib/client-api";
import {
  contactsToCsv,
  contactsToVcard,
  isContactPickerSupported,
  parseContactFile,
  type ImportedContact,
} from "../../lib/contact-file";

type Locale = "ar" | "en";
type SavedContact = { id: string; display_name: string; email: string | null; phone: string | null };

function downloadBlob(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function pickFromDevice(): Promise<ImportedContact[]> {
  const contactsApi = (navigator as Navigator & {
    contacts?: {
      select: (properties: string[], options?: { multiple?: boolean }) => Promise<Array<{
        name?: string[];
        email?: string[];
        tel?: string[];
      }>>;
    };
  }).contacts;
  if (!contactsApi?.select) throw new Error("CONTACTS_UNSUPPORTED");
  const selected = await contactsApi.select(["name", "email", "tel"], { multiple: true });
  return selected.map((item) => ({
    displayName: String(item.name?.[0] ?? "").trim() || String(item.email?.[0] ?? item.tel?.[0] ?? "جهة اتصال"),
    email: String(item.email?.[0] ?? "").trim().toLowerCase(),
    phone: String(item.tel?.[0] ?? "").trim(),
  })).filter((item) => item.displayName || item.email || item.phone);
}

export function ContactSourceBar({
  locale,
  savedContacts,
  onApply,
  onContactsSaved,
}: {
  locale: Locale;
  savedContacts: SavedContact[];
  onApply: (contact: ImportedContact) => void;
  onContactsSaved?: (contacts: SavedContact[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const pickerOk = isContactPickerSupported();

  const persist = async (contacts: ImportedContact[]) => {
    const usable = contacts.filter((item) => item.displayName.trim().length >= 1 && (item.email || item.phone));
    if (!usable.length) return contacts;
    const response = await apiFetch("/api/dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "importSavedContacts",
        idempotencyKey: crypto.randomUUID(),
        contacts: usable.map((item) => ({
          displayName: item.displayName.slice(0, 80),
          email: item.email,
          phone: item.phone,
        })),
      }),
    });
    const result = await response.json() as { error?: string; contacts?: SavedContact[]; imported?: number };
    if (!response.ok) throw new Error(result.error ?? "IMPORT_FAILED");
    onContactsSaved?.(result.contacts ?? []);
    return contacts;
  };

  const fromPhone = async () => {
    setBusy(true);
    setNote("");
    try {
      const picked = await pickFromDevice();
      if (!picked.length) return;
      await persist(picked);
      if (picked.length === 1) onApply(picked[0]);
      setNote(locale === "ar"
        ? `تم جلب ${picked.length} جهة من الهاتف. اختر واحدة بالأسفل أو تُعبأ الحقول مباشرة.`
        : `Imported ${picked.length} contact(s) from the phone. Pick one below or the form is filled.`);
      if (picked.length > 1) onApply(picked[0]);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setNote(code === "CONTACTS_UNSUPPORTED" || /NotSupported|undefined/i.test(code)
        ? (locale === "ar" ? "المتصفح لا يدعم دفتر الهاتف مباشرة. ارفع ملف vCard أو CSV من جهات اتصال الهاتف أو البريد." : "This browser cannot open the phone book. Upload a vCard/CSV exported from your phone or email.")
        : (locale === "ar" ? "لم يتم منح صلاحية جهات الاتصال، أو أُلغي الاختيار." : "Contact permission was denied or the picker was cancelled."));
    } finally {
      setBusy(false);
    }
  };

  const fromFile = async (file: File) => {
    setBusy(true);
    setNote("");
    try {
      const text = await file.text();
      const parsed = parseContactFile(file.name, text);
      if (!parsed.length) throw new Error("EMPTY_FILE");
      await persist(parsed);
      onApply(parsed[0]);
      setNote(locale === "ar"
        ? `تم رفع ${parsed.length} جهة اتصال من الملف.`
        : `Imported ${parsed.length} contact(s) from the file.`);
    } catch {
      setNote(locale === "ar" ? "تعذر قراءة الملف. استخدم vCard (.vcf) أو CSV بالأعمدة: الاسم، البريد، الهاتف." : "Could not read the file. Use vCard (.vcf) or CSV with name, email, phone columns.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const download = (kind: "vcf" | "csv") => {
    const rows = savedContacts.map((item) => ({
      displayName: item.display_name,
      email: item.email ?? "",
      phone: item.phone ?? "",
    }));
    if (!rows.length) {
      setNote(locale === "ar" ? "لا توجد جهات محفوظة للتنزيل بعد." : "No saved contacts to download yet.");
      return;
    }
    if (kind === "vcf") downloadBlob("wazen-contacts.vcf", "text/vcard;charset=utf-8", contactsToVcard(rows));
    else downloadBlob("wazen-contacts.csv", "text/csv;charset=utf-8", contactsToCsv(rows));
  };

  return (
    <div className="contact-source-bar">
      <span>{locale === "ar" ? "ربط جهات الاتصال" : "Link contacts"}</span>
      <div className="contact-source-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void fromPhone()}>
          <Phone size={14} />{locale === "ar" ? "من الهاتف" : "From phone"}
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload size={14} />{locale === "ar" ? "رفع ملف / بريد" : "Upload file / email"}
        </button>
        <button type="button" className="secondary-button" disabled={busy || !savedContacts.length} onClick={() => download("vcf")}>
          <Download size={14} />{locale === "ar" ? "تنزيل vCard" : "Download vCard"}
        </button>
        <button type="button" className="secondary-button" disabled={busy || !savedContacts.length} onClick={() => download("csv")}>
          <Mail size={14} />{locale === "ar" ? "تنزيل CSV" : "Download CSV"}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".vcf,.vcard,.csv,text/vcard,text/csv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void fromFile(file);
        }}
      />
      <small className="field-hint">
        {pickerOk
          ? (locale === "ar" ? "بعد منح الصلاحية يمكنك اختيار جهات من دفتر الهاتف مباشرة." : "After permission, pick contacts directly from the phone book.")
          : (locale === "ar" ? "صدّر جهات الهاتف أو Gmail/Outlook كملف vCard أو CSV ثم ارفعها هنا." : "Export phone or Gmail/Outlook contacts as vCard or CSV, then upload here.")}
      </small>
      {note ? <p className="modal-note">{note}</p> : null}
    </div>
  );
}
