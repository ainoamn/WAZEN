/** Persist admin overrides for transactional email templates. */

import {
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_IDS,
  type EmailTemplateDefinition,
  type EmailTemplateId,
} from "./email-template-catalog";

export type StoredEmailTemplate = {
  id: EmailTemplateId;
  subject_ar: string;
  subject_en: string;
  body_html_ar: string;
  body_html_en: string;
  text_ar: string;
  text_en: string;
  updated_at: string | null;
};

export async function ensureEmailTemplatesTable(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY,
    subject_ar TEXT NOT NULL,
    subject_en TEXT NOT NULL,
    body_html_ar TEXT NOT NULL,
    body_html_en TEXT NOT NULL,
    text_ar TEXT NOT NULL,
    text_en TEXT NOT NULL,
    updated_at TEXT
  )`).run();
}

export async function listEmailTemplates(db: D1Database): Promise<Array<EmailTemplateDefinition & { customized: boolean; updatedAt: string | null }>> {
  await ensureEmailTemplatesTable(db);
  const rows = await db.prepare(
    "SELECT id,subject_ar,subject_en,body_html_ar,body_html_en,text_ar,text_en,updated_at FROM email_templates",
  ).all<StoredEmailTemplate>();
  const byId = new Map((rows.results ?? []).map((row) => [row.id, row]));
  return EMAIL_TEMPLATE_IDS.map((id) => {
    const base = DEFAULT_EMAIL_TEMPLATES[id];
    const row = byId.get(id);
    if (!row) return { ...base, customized: false, updatedAt: null };
    return {
      ...base,
      subjectAr: row.subject_ar || base.subjectAr,
      subjectEn: row.subject_en || base.subjectEn,
      bodyHtmlAr: row.body_html_ar || base.bodyHtmlAr,
      bodyHtmlEn: row.body_html_en || base.bodyHtmlEn,
      textAr: row.text_ar || base.textAr,
      textEn: row.text_en || base.textEn,
      customized: true,
      updatedAt: row.updated_at,
    };
  });
}

export async function resolveEmailTemplate(db: D1Database | null | undefined, id: string): Promise<EmailTemplateDefinition> {
  const fallbackId = (EMAIL_TEMPLATE_IDS.includes(id as EmailTemplateId) ? id : "dues_digest") as EmailTemplateId;
  const base = DEFAULT_EMAIL_TEMPLATES[fallbackId] ?? DEFAULT_EMAIL_TEMPLATES.dues_digest;
  if (!db || !EMAIL_TEMPLATE_IDS.includes(id as EmailTemplateId)) return base;
  try {
    await ensureEmailTemplatesTable(db);
    const row = await db.prepare(
      "SELECT id,subject_ar,subject_en,body_html_ar,body_html_en,text_ar,text_en FROM email_templates WHERE id=?",
    ).bind(id).first<StoredEmailTemplate>();
    if (!row) return base;
    return {
      ...base,
      subjectAr: row.subject_ar || base.subjectAr,
      subjectEn: row.subject_en || base.subjectEn,
      bodyHtmlAr: row.body_html_ar || base.bodyHtmlAr,
      bodyHtmlEn: row.body_html_en || base.bodyHtmlEn,
      textAr: row.text_ar || base.textAr,
      textEn: row.text_en || base.textEn,
    };
  } catch {
    return base;
  }
}

export async function upsertEmailTemplate(
  db: D1Database,
  input: {
    id: EmailTemplateId;
    subjectAr: string;
    subjectEn: string;
    bodyHtmlAr: string;
    bodyHtmlEn: string;
    textAr: string;
    textEn: string;
  },
) {
  await ensureEmailTemplatesTable(db);
  if (!EMAIL_TEMPLATE_IDS.includes(input.id)) throw new Error("INVALID_TEMPLATE");
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO email_templates
    (id,subject_ar,subject_en,body_html_ar,body_html_en,text_ar,text_en,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      subject_ar=excluded.subject_ar,
      subject_en=excluded.subject_en,
      body_html_ar=excluded.body_html_ar,
      body_html_en=excluded.body_html_en,
      text_ar=excluded.text_ar,
      text_en=excluded.text_en,
      updated_at=excluded.updated_at`).bind(
    input.id,
    input.subjectAr.slice(0, 200),
    input.subjectEn.slice(0, 200),
    input.bodyHtmlAr.slice(0, 20_000),
    input.bodyHtmlEn.slice(0, 20_000),
    input.textAr.slice(0, 8_000),
    input.textEn.slice(0, 8_000),
    now,
  ).run();
  return listEmailTemplates(db);
}

export async function resetEmailTemplate(db: D1Database, id: EmailTemplateId) {
  await ensureEmailTemplatesTable(db);
  await db.prepare("DELETE FROM email_templates WHERE id=?").bind(id).run();
  return listEmailTemplates(db);
}
