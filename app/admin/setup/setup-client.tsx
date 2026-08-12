"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminSetupClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    if (password.length < 12) {
      setError("كلمة المرور يجب ألا تقل عن 12 حرفاً");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "completeAdminBootstrap",
          token,
          displayName,
          password,
        }),
      });
      const result = await response.json() as { error?: string; next?: string };
      if (!response.ok) throw new Error(result.error ?? "BOOTSTRAP_FAILED");
      router.push(result.next ?? "/account/security");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "BOOTSTRAP_FAILED");
    } finally {
      setSaving(false);
    }
  };

  if (!token) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f4f6f2" }}>
        <section style={{ width: "min(440px, 100%)", padding: 28, borderRadius: 18, background: "white", border: "1px solid #e4ebe6" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>تهيئة مدير وازن</h1>
          <p style={{ margin: 0, color: "#5f6e68", fontSize: 14, lineHeight: 1.7 }}>الرمز مفقود. شغّل <code>npm run admin:bootstrap</code> واطلب الرابط مرة واحدة.</p>
        </section>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f4f6f2" }}>
      <section style={{ width: "min(440px, 100%)", padding: 28, borderRadius: 18, background: "white", border: "1px solid #e4ebe6" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>تهيئة المدير الأول</h1>
        <p style={{ margin: "0 0 18px", color: "#5f6e68", fontSize: 14, lineHeight: 1.7 }}>
          عيّن الاسم وكلمة المرور الآن. بعد الدخول فعّل TOTP فوراً من إعدادات الأمان، ثم أزل رموز التهيئة من البيئة.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>الاسم الظاهر</span>
            <input required minLength={2} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} style={{ height: 42, borderRadius: 10, border: "1px solid #dfe5e1", padding: "0 12px" }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>كلمة المرور</span>
            <input required type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} style={{ height: 42, borderRadius: 10, border: "1px solid #dfe5e1", padding: "0 12px" }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>تأكيد كلمة المرور</span>
            <input required type="password" minLength={12} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} style={{ height: 42, borderRadius: 10, border: "1px solid #dfe5e1", padding: "0 12px" }} />
          </label>
          {error && <p style={{ margin: 0, color: "#b42318", fontSize: 13 }}>{error}</p>}
          <button disabled={saving} type="submit" style={{ height: 44, border: 0, borderRadius: 11, background: "#1f6f5b", color: "white", fontWeight: 700, cursor: "pointer" }}>
            {saving ? "جارٍ الإنشاء…" : "إنشاء المدير وتسجيل الدخول"}
          </button>
        </form>
      </section>
    </main>
  );
}
