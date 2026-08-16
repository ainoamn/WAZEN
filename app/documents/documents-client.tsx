"use client";

import { CheckCircle2, Download, FileBarChart, FileCheck2, FileDown, FileText, Filter, Plus, Printer, ReceiptText, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Brand, ErrorCard, money, PageLoader, Status, useCommerceLocale } from "../commercial-kit";
import { apiFetch } from "../../lib/client-api";
import { wrapPrintDocument, printWazenHtml, downloadReportHtml, resolvePrintLogoUrl } from "../../lib/print-document";
import { downloadedHtmlCsp, escapeHtml, safeDownloadFilename } from "../../lib/html";

type DocumentRow = { id: string; owner_user_id: string; space_id: string | null; type: string; reference: string; person_name: string; description: string; amount_minor: number; currency: string; status: string; payment_method: string; approved_by: string | null; issued_at: string };
type Data = { user: { displayName: string; email: string }; role: string; documents: DocumentRow[]; spaces: { id: string; name_ar: string; name_en: string }[] };
const types: Record<string, [string,string,string]> = {
  receipt: ["إيصال قبض","Receipt","RCV"], disbursement: ["سند صرف","Disbursement voucher","PAY"], handover: ["تسليم واستلام","Handover receipt","HND"],
  member_statement: ["كشف حساب عضو","Member statement","MEM"], society_statement: ["كشف جمعية وأدوار","Circle statement","SOC"], trip_statement: ["كشف رحلة وتسويات","Trip statement","TRP"],
  household_statement: ["كشف مصروفات المنزل","Household statement","HOM"], personal_report: ["تقرير مالي شخصي","Personal report","PER"],
};

export function DocumentsClient() {
  const router = useRouter();
  const { locale, setLocale, l } = useCommerceLocale();
  const [data, setData] = useState<Data | null>(null); const [selected, setSelected] = useState<DocumentRow | null>(null);
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all"); const [modal, setModal] = useState(false); const [error, setError] = useState("");
  const load = useCallback(() => fetch("/api/platform?view=documents", { cache: "no-store", credentials: "include" }).then(async r => { if(r.status===401){router.push("/login?next=/documents");throw new Error();}if (!r.ok) throw new Error(); return await r.json() as Data; }).then((result) => { const documents = result.documents ?? []; const next = { ...result, documents, spaces: result.spaces ?? [] }; setData(next); setError(""); setSelected(current => current ? documents.find(doc => doc.id === current.id) ?? documents[0] : documents[0]); }).catch(() => setError(locale === "ar" ? "تعذر تحميل المستندات" : "Could not load documents")), [locale, router]);
  useEffect(() => { void load(); }, [load]);
  const rows = useMemo(() => data?.documents.filter(doc => (filter === "all" || doc.type === filter) && `${doc.reference} ${doc.person_name} ${doc.description}`.toLowerCase().includes(query.toLowerCase())) ?? [], [data,filter,query]);
  if (error) return <ErrorCard message={error} retry={load}/>; if (!data) return <PageLoader/>;
  const counts = Object.fromEntries(Object.keys(types).map(type => [type, data.documents.filter(doc => doc.type === type).length]));
  const download = () => selected && void resolveAndDownload(selected, locale, data.user.displayName);
  const printSelected = () => selected && void printWazenHtml((logoUrl) => documentHtml(selected, locale, data.user.displayName, logoUrl), true);
  return <main className="documents-page"><header className="documents-header"><Brand/><nav><a href="/dashboard">{l("لوحة المستخدم","Dashboard")}</a><a href="/billing">{l("الفوترة","Billing")}</a>{["super_admin","admin","finance","support"].includes(data.role)&&<a href="/admin">{l("الإدارة","Admin")}</a>}</nav><button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "EN" : "عربي"}</button></header>
    <div className="documents-layout"><aside><h2>{l("المستندات المالية","Financial documents")}</h2><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><FileText/> {l("جميع المستندات","All documents")}<b>{data.documents.length}</b></button>{Object.entries(types).map(([key,value]) => <button className={filter === key ? "active" : ""} onClick={() => setFilter(key)} key={key}><ReceiptText/> {locale === "ar" ? value[0] : value[1]}<b>{counts[key]}</b></button>)}</aside>
    <section className="documents-main"><div className="documents-title"><div><small>{l("وازن / مركز المستندات","Wazen / Document center")}</small><h1>{l("الإيصالات والكشوفات","Receipts & statements")}</h1><p>{l("إنشاء ومعاينة وطباعة وتنزيل المستندات المالية المرقمة.","Create, preview, print and download numbered financial documents.")}</p></div><div><button onClick={printSelected}><Printer/>{l("طباعة / PDF","Print / PDF")}</button><button onClick={download}><Download/>{l("تنزيل نسخة","Download")}</button><button className="primary" onClick={() => setModal(true)}><Plus/>{l("مستند جديد","New document")}</button></div></div>
    <div className="document-kpis"><article><ReceiptText/><span>{l("إيصالات قبض","Receipts")}</span><b>{counts.receipt}</b></article><article><FileDown/><span>{l("سندات صرف","Disbursements")}</span><b>{counts.disbursement}</b></article><article><FileCheck2/><span>{l("تسليم واستلام","Handovers")}</span><b>{counts.handover}</b></article><article><FileBarChart/><span>{l("كشوف وتقارير","Statements")}</span><b>{data.documents.length-counts.receipt-counts.disbursement-counts.handover}</b></article></div>
    <div className="document-workspace"><div className="document-list"><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={l("بحث بالرقم أو الاسم...","Search by reference or name...")}/><Filter/></label>{rows.map(doc => <button className={selected?.id === doc.id ? "active" : ""} onClick={() => setSelected(doc)} key={doc.id}><i><ReceiptText/></i><span><b>{locale === "ar" ? types[doc.type]?.[0] : types[doc.type]?.[1]}</b><small>{doc.reference} · {doc.person_name}</small></span><strong>{doc.amount_minor ? money(doc.amount_minor,locale,doc.currency) : "—"}</strong><em>{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB",{dateStyle:"medium"}).format(new Date(doc.issued_at))}</em></button>)}{!rows.length&&<div className="document-empty"><FileText/><span>{l("لا توجد مستندات مطابقة","No matching documents")}</span></div>}</div>{selected ? <ReceiptPreview doc={selected} locale={locale} issuer={data.user.displayName}/> : <div className="receipt-preview empty"><FileText/><p>{l("اختر مستنداً للمعاينة","Select a document to preview")}</p></div>}</div>
    <section className="statement-launcher"><div><h2>{l("إنشاء كشف جديد","Create a statement")}</h2><p>{l("قوالب جاهزة لكل نوع من الحسابات.","Ready templates for every account type.")}</p></div><div>{["member_statement","society_statement","trip_statement","household_statement","personal_report"].map(type=><button key={type} onClick={()=>setModal(true)}><FileBarChart/><span><b>{locale === "ar" ? types[type][0] : types[type][1]}</b><small>{l("من البيانات المسجلة مباشرة","Generated from live records")}</small></span><em>←</em></button>)}</div></section>
    </section></div>{modal&&<CreateDocument data={data} locale={locale} onClose={()=>setModal(false)} onCreated={(doc)=>{setData({...data,documents:[doc,...data.documents]});setSelected(doc);setModal(false);}}/>}</main>;
}

function ReceiptPreview({ doc, locale, issuer }: { doc: DocumentRow; locale: "ar"|"en"; issuer: string }) {
  const l=(ar:string,en:string)=>locale==="ar"?ar:en;
  return <article className="receipt-preview" id="printable-document"><header><Brand compact/><span>{l("مستند إلكتروني معتمد","Verified electronic document")}</span></header><div className="receipt-title"><small>{l("نوع المستند","Document type")}</small><h2>{locale === "ar" ? types[doc.type]?.[0] : types[doc.type]?.[1]}</h2><code>{doc.reference}</code></div><dl><div><dt>{l("استلمنا من / صُرف إلى","Received from / Paid to")}</dt><dd>{doc.person_name}</dd></div><div><dt>{l("المبلغ","Amount")}</dt><dd>{doc.amount_minor ? money(doc.amount_minor,locale,doc.currency) : l("وفق الكشف المرفق","Per attached statement")}</dd></div><div><dt>{l("البيان","Description")}</dt><dd>{doc.description}</dd></div><div><dt>{l("التاريخ","Date")}</dt><dd>{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB",{dateStyle:"long"}).format(new Date(doc.issued_at))}</dd></div><div><dt>{l("طريقة الدفع","Payment method")}</dt><dd>{doc.payment_method === "bank_transfer" ? l("تحويل بنكي","Bank transfer") : doc.payment_method}</dd></div><div><dt>{l("الحالة","Status")}</dt><dd><Status value={doc.status} locale={locale}/></dd></div></dl><div className="receipt-signatures"><div><span>{l("المستلم","Recipient")}</span><i/><small>{l("الاسم والتوقيع","Name & signature")}</small></div><div><span>{l("أمين الصندوق","Treasurer")}</span><i/><small>{issuer}</small></div><div><span>{l("الاعتماد","Approval")}</span><i className="stamp"><CheckCircle2/></i><small>{doc.approved_by ?? issuer}</small></div></div><footer><span>{l("تم إنشاء هذا المستند إلكترونياً بواسطة وازن","Generated electronically by Wazen")}</span><b>VERIFY · {doc.reference}</b></footer></article>;
}

function CreateDocument({data,locale,onClose,onCreated}:{data:Data;locale:"ar"|"en";onClose:()=>void;onCreated:(doc:DocumentRow)=>void}){
  const l=(ar:string,en:string)=>locale==="ar"?ar:en; const [saving,setSaving]=useState(false); const [type,setType]=useState("receipt"); const [personName,setPerson]=useState(""); const [description,setDescription]=useState(""); const [amount,setAmount]=useState(""); const [spaceId,setSpaceId]=useState("");
  const submit=async(e:FormEvent)=>{e.preventDefault();setSaving(true);const r=await apiFetch("/api/platform",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"createDocument",idempotencyKey:crypto.randomUUID(),type,personName,description,amount:amount||"0",spaceId:spaceId||undefined})});const result=await r.json() as {document:DocumentRow};setSaving(false);if(r.ok)onCreated(result.document);};
  return <div className="commerce-modal-bg"><form className="document-modal" onSubmit={submit}><button type="button" onClick={onClose}><X/></button><small>{l("مستند مالي جديد","New financial document")}</small><h2>{l("إنشاء وترقيم المستند","Create and number document")}</h2><label><span>{l("نوع المستند","Document type")}</span><select value={type} onChange={e=>setType(e.target.value)}>{Object.entries(types).map(([key,value])=><option value={key} key={key}>{locale==="ar"?value[0]:value[1]}</option>)}</select></label><label><span>{l("الاسم","Name")}</span><input required value={personName} onChange={e=>setPerson(e.target.value)}/></label><label><span>{l("البيان","Description")}</span><textarea required value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="document-form-row"><label><span>{l("المبلغ","Amount")}</span><input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label><span>{l("المحفظة","Wallet")}</span><select value={spaceId} onChange={e=>setSpaceId(e.target.value)}><option value="">—</option>{data.spaces.map(space=><option value={space.id} key={space.id}>{locale==="ar"?space.name_ar:space.name_en}</option>)}</select></label></div><button className="submit" disabled={saving}>{saving?l("جارٍ الإنشاء...","Creating..."):l("إنشاء المستند","Create document")}</button></form></div>;
}

function documentHtml(doc: DocumentRow, locale: "ar" | "en", issuer: string, logoUrl: string) {
  const title = locale === "ar" ? types[doc.type]?.[0] : types[doc.type]?.[1];
  const body = `<section>
    <p class="empty">VERIFY · ${escapeHtml(doc.reference)}</p>
    <table>
      <tr><td>${locale === "ar" ? "الاسم" : "Name"}</td><td>${escapeHtml(doc.person_name)}</td></tr>
      <tr><td>${locale === "ar" ? "البيان" : "Description"}</td><td>${escapeHtml(doc.description)}</td></tr>
      <tr><td>${locale === "ar" ? "المبلغ" : "Amount"}</td><td>${escapeHtml(String(doc.amount_minor))} ${escapeHtml(doc.currency)}</td></tr>
      <tr><td>${locale === "ar" ? "التاريخ" : "Date"}</td><td>${escapeHtml(new Date(doc.issued_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB"))}</td></tr>
      <tr><td>${locale === "ar" ? "أُصدر بواسطة" : "Issued by"}</td><td>${escapeHtml(issuer)}</td></tr>
    </table>
  </section>`;
  return wrapPrintDocument({
    locale,
    title: title ?? doc.type,
    entityName: doc.reference,
    logoUrl,
    subtitle: locale === "ar" ? "مستند إلكتروني معتمد" : "Verified electronic document",
    bodyHtml: body,
    footer: `VERIFY · ${doc.reference} · Generated by Wazen`,
  });
}

function resolveAndDownload(doc: DocumentRow, locale: "ar" | "en", issuer: string) {
  void resolvePrintLogoUrl().then((logoUrl) => {
    downloadReportHtml(documentHtml(doc, locale, issuer, logoUrl), `${safeDownloadFilename(doc.reference)}.pdf`);
  });
}
