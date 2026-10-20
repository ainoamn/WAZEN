"use client";

import { Download, Mail, Phone, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { apiFetch } from "../../lib/client-api";
import {
  contactsToCsv,
  contactsToVcard,
  decodeContactFileBytes,
  isContactPickerSupported,
  parseContactFile,
  type ImportedContact,
} from "../../lib/contact-file";

type GoogleOAuth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: { access_token?: string; error?: string }) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => { requestAccessToken: () => void };
};

declare global {
  interface Window {
    google?: { accounts?: { oauth2: GoogleOAuth2 } };
  }
}

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
    const usable = contacts
      .map((item) => {
        let email = item.email.trim();
        let phone = item.phone.trim();
        // Phone numbers often land in the email column from Excel exports.
        if (!phone && email && !email.includes("@") && email.replace(/\D/g, "").length >= 7) {
          phone = email;
          email = "";
        }
        return {
          displayName: item.displayName.trim().slice(0, 80),
          email,
          phone,
        };
      })
      .filter((item) => item.displayName.length >= 1 && (item.email || item.phone));
    if (!usable.length) return { contacts, imported: 0 };
    const response = await apiFetch("/api/dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "importSavedContacts",
        idempotencyKey: crypto.randomUUID(),
        contacts: usable,
      }),
    });
    const result = await response.json() as { error?: string; contacts?: SavedContact[]; imported?: number };
    if (!response.ok) throw new Error(result.error ?? "IMPORT_FAILED");
    onContactsSaved?.(result.contacts ?? []);
    return { contacts, imported: result.imported ?? usable.length };
  };

  const fromPhone = async () => {
    setBusy(true);
    setNote("");
    try {
      const picked = await pickFromDevice();
      if (!picked.length) return;
      const saved = await persist(picked);
      onApply(picked[0]);
      setNote(locale === "ar"
        ? `تم حفظ ${saved.imported} جهة من الهاتف في سجل العناوين. اختر عضواً من القائمة بالأسفل لإضافته للجمعية.`
        : `Saved ${saved.imported} phone contact(s) to the address book. Pick one below to add to the society.`);
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
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        throw new Error("XLSX_NOT_SUPPORTED");
      }
      const buffer = await file.arrayBuffer();
      const text = decodeContactFileBytes(buffer);
      const parsed = parseContactFile(file.name, text);
      if (!parsed.length) throw new Error("EMPTY_FILE");
      const saved = await persist(parsed);
      const firstWithPhone = parsed.find((item) => item.phone || item.email) ?? parsed[0];
      onApply(firstWithPhone);
      if (!saved.imported) {
        setNote(locale === "ar"
          ? "قُرئ الملف لكن لم يُحفظ أي سجل: كل صف يحتاج اسماً مع هاتف أو بريد. تحقق من الأعمدة: الاسم، الهاتف، البريد."
          : "File was read but nothing was saved: each row needs a name plus a phone or email. Use columns: name, phone, email.");
        return;
      }
      setNote(locale === "ar"
        ? `تم حفظ ${saved.imported} جهة في سجل العناوين (من ${parsed.length} صفاً). اختر العضو من «سجل العناوين» بالأسفل ثم اضغط «إضافة المساهم». الرفع لا يضيف كل الأعضاء دفعة واحدة إلى الجمعية.`
        : `Saved ${saved.imported} contact(s) to the address book (from ${parsed.length} rows). Pick a member from the address book below, then Add member. Upload does not add everyone to the society at once.`);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      if (code === "XLSX_NOT_SUPPORTED") {
        setNote(locale === "ar"
          ? "ملف Excel (.xlsx) غير مدعوم هنا. من إكسل: ملف → حفظ باسم → CSV UTF-8 (أو CSV) بالأعمدة: الاسم، رقم الهاتف، البريد — ثم ارفع ملف CSV."
          : "Excel (.xlsx) is not supported here. In Excel: File → Save As → CSV UTF-8 with columns name, phone, email — then upload the CSV.");
        return;
      }
      setNote(locale === "ar"
        ? "تعذر قراءة الملف. استخدم vCard (.vcf) أو CSV بترميز UTF-8 والأعمدة: الاسم، رقم الهاتف، البريد."
        : "Could not read the file. Use vCard (.vcf) or UTF-8 CSV with columns: name, phone, email.");
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
        accept=".vcf,.vcard,.csv,text/vcard,text/csv,text/plain"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void fromFile(file);
        }}
      />
      <small className="field-hint">
        {locale === "ar"
          ? (pickerOk
            ? "من الهاتف يفتح دفتر الجهاز. من Gmail يجلب جهات بريدك. لرفع أسماء الجمعية: احفظ ورقة «المساهمون» كـ CSV UTF-8 (ليس xlsx)."
            : "ارفع CSV بترميز UTF-8 (الاسم، رقم الهاتف، البريد). ملف Excel .xlsx لا يُقبل — احفظه CSV من إكسل أولاً.")
          : (pickerOk
            ? "From phone opens the device book. From Gmail links mailbox contacts. For a society roster: save the members sheet as CSV UTF-8 (not xlsx)."
            : "Upload a UTF-8 CSV (name, phone, email). Excel .xlsx is not accepted — save as CSV from Excel first.")}
      </small>
      {note ? <p className="modal-note">{note}</p> : null}
    </div>
  );
}
