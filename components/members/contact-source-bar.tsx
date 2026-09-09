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

async function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-wazen-gsi]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("GOOGLE_CONTACTS_FAILED")), { once: true });
      if (window.google?.accounts?.oauth2) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.dataset.wazenGsi = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("GOOGLE_CONTACTS_FAILED"));
    document.head.appendChild(script);
  });
}

function requestGoogleContactsToken(clientId: string) {
  return new Promise<string>((resolve, reject) => {
    const fail = (error?: string) => {
      const code = String(error ?? "").toLowerCase();
      if (code.includes("access_denied") || code.includes("popup_closed")) {
        reject(new Error("GOOGLE_CONTACTS_DENIED"));
        return;
      }
      reject(new Error("GOOGLE_CONTACTS_FAILED"));
    };
    const client = window.google?.accounts?.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/contacts.readonly",
      callback: (response: { access_token?: string; error?: string }) => {
        if (response.access_token) resolve(response.access_token);
        else fail(response.error);
      },
      error_callback: (error: { type?: string; message?: string }) => {
        fail(error?.type || error?.message);
      },
    });
    if (!client) {
      reject(new Error("GOOGLE_CONTACTS_FAILED"));
      return;
    }
    client.requestAccessToken();
  });
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
  googleClientId,
  onApply,
  onContactsSaved,
}: {
  locale: Locale;
  savedContacts: SavedContact[];
  googleClientId?: string;
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
      onApply(picked[0]);
      setNote(locale === "ar"
        ? `تم جلب ${picked.length} جهة من الهاتف. اختر واحدة من القائمة بالأسفل.`
        : `Imported ${picked.length} contact(s) from the phone. Pick one from the list below.`);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setNote(code === "CONTACTS_UNSUPPORTED" || /NotSupported|undefined/i.test(code)
        ? (locale === "ar" ? "المتصفح لا يفتح دفتر الهاتف مباشرة. استخدم «من Gmail» أو ارفع ملفاً." : "This browser cannot open the phone book. Use Gmail or upload a file.")
        : (locale === "ar" ? "لم يتم منح صلاحية جهات الاتصال، أو أُلغي الاختيار." : "Contact permission was denied or the picker was cancelled."));
    } finally {
      setBusy(false);
    }
  };

  const fromGmail = async () => {
    if (!googleClientId) {
      setNote(locale === "ar" ? "ربط Gmail غير مهيأ على هذا الموقع." : "Gmail contact linking is not configured.");
      return;
    }
    setBusy(true);
    setNote("");
    try {
      await loadGoogleIdentity();
      const accessToken = await requestGoogleContactsToken(googleClientId);
      const response = await apiFetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "importGoogleContacts",
          idempotencyKey: crypto.randomUUID(),
          accessToken,
        }),
      });
      const result = await response.json() as { error?: string; contacts?: SavedContact[]; imported?: number };
      if (!response.ok) throw new Error(result.error ?? "GOOGLE_CONTACTS_FAILED");
      onContactsSaved?.(result.contacts ?? []);
      const first = (result.contacts ?? []).find((item) => item.phone || item.email);
      if (first) {
        onApply({
          displayName: first.display_name,
          email: first.email ?? "",
          phone: first.phone ?? "",
        });
      }
      setNote(locale === "ar"
        ? `تم ربط ${result.imported ?? 0} جهة من Gmail. اختر واحدة من «سجل العناوين» بالأسفل.`
        : `Linked ${result.imported ?? 0} Gmail contact(s). Pick one from the address book below.`);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "GOOGLE_CONTACTS_FAILED";
      const messages: Record<string, string> = locale === "ar"
        ? {
          GOOGLE_CONTACTS_DENIED: "جوجل حظر الحساب لأن تطبيق bhd-om.com لم يُتحقق بعد لنطاق جهات الاتصال. أضف البريد كمختبر في شاشة موافقة OAuth، أو صدّر جهات Gmail كملف vCard ثم استخدم «رفع ملف».",
          GOOGLE_CONTACTS_FAILED: "تعذر جلب جهات Gmail. أعد المحاولة أو ارفع ملفاً.",
        }
        : {
          GOOGLE_CONTACTS_DENIED: "Google blocked this account because bhd-om.com is not verified for the Contacts scope. Add the Gmail as an OAuth test user, or export a vCard from Google Contacts and use Upload file.",
          GOOGLE_CONTACTS_FAILED: "Could not import Gmail contacts. Try again or upload a file.",
        };
      setNote(messages[code] ?? messages.GOOGLE_CONTACTS_FAILED);
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
        <button type="button" className="secondary-button" disabled={busy || !googleClientId} onClick={() => void fromGmail()}>
          <Mail size={14} />{locale === "ar" ? "من Gmail" : "From Gmail"}
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload size={14} />{locale === "ar" ? "رفع ملف" : "Upload file"}
        </button>
        <button type="button" className="secondary-button" disabled={busy || !savedContacts.length} onClick={() => download("vcf")}>
          <Download size={14} />{locale === "ar" ? "تنزيل vCard" : "Download vCard"}
        </button>
        <button type="button" className="secondary-button" disabled={busy || !savedContacts.length} onClick={() => download("csv")}>
          <Download size={14} />{locale === "ar" ? "تنزيل CSV" : "Download CSV"}
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
        {locale === "ar"
          ? (pickerOk
            ? "من الهاتف يفتح دفتر الجهاز. من Gmail يجلب جهات بريدك بعد منح الصلاحية، دون تنزيل ملف."
            : "على هذا المتصفح استخدم «من Gmail» لربط جهات البريد مباشرة، أو ارفع ملف vCard/CSV.")
          : (pickerOk
            ? "From phone opens the device book. From Gmail links your mailbox contacts after permission, with no file download."
            : "On this browser use From Gmail to link mailbox contacts directly, or upload a vCard/CSV file.")}
      </small>
      {note ? <p className="modal-note">{note}</p> : null}
    </div>
  );
}
