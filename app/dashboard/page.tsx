"use client";

import { useMemo, useState } from "react";
import { AdminPanel, PricingView } from "../saas-panels";

type Currency = "OMR" | "AED" | "SAR" | "QAR" | "BHD" | "KWD" | "USD";
type View = "overview" | "wallets" | "transactions" | "members" | "reports" | "personal" | "home" | "travel" | "circle";
type Mode = "user" | "admin" | "pricing";

const currencies: Record<Currency, { ar: string; en: string; symbol: string; rate: number; flag: string }> = {
  OMR: { ar: "الريال العُماني", en: "Omani Rial", symbol: "ر.ع", rate: 1, flag: "🇴🇲" },
  AED: { ar: "الدرهم الإماراتي", en: "UAE Dirham", symbol: "د.إ", rate: 9.55, flag: "🇦🇪" },
  SAR: { ar: "الريال السعودي", en: "Saudi Riyal", symbol: "ر.س", rate: 9.75, flag: "🇸🇦" },
  QAR: { ar: "الريال القطري", en: "Qatari Riyal", symbol: "ر.ق", rate: 9.46, flag: "🇶🇦" },
  BHD: { ar: "الدينار البحريني", en: "Bahraini Dinar", symbol: "د.ب", rate: 0.98, flag: "🇧🇭" },
  KWD: { ar: "الدينار الكويتي", en: "Kuwaiti Dinar", symbol: "د.ك", rate: 0.80, flag: "🇰🇼" },
  USD: { ar: "الدولار الأمريكي", en: "US Dollar", symbol: "$", rate: 2.60, flag: "🇺🇸" },
};

const walletData = [
  { id: "personal" as View, icon: "◈", title: "محفظتي الشخصية", sub: "الدخل والمصروف والادخار", balance: 2840, color: "purple", trend: "+8.4%" },
  { id: "home" as View, icon: "⌂", title: "مصاريف المنزل", sub: "ميزانية الأسرة والفواتير", balance: 680, color: "amber", trend: "62% مستخدم" },
  { id: "travel" as View, icon: "✈", title: "سفرة العائلة 2027", sub: "ادخار جماعي ومصاريف الرحلة", balance: 1240, color: "green", trend: "20.7% من الهدف" },
  { id: "circle" as View, icon: "◎", title: "جمعية الإخوة", sub: "جمعية دورية · 6 أعضاء", balance: 3600, color: "blue", trend: "الدور القادم: سالم" },
];

const txs = [
  { date: "10 أغسطس", title: "مساهمة أغسطس", member: "عبدالحميد الرواحي", wallet: "سفرة العائلة", amount: 50, kind: "مساهمة", state: "معتمدة" },
  { date: "9 أغسطس", title: "حجز تذاكر الطيران", member: "دفعها أحمد من ماله", wallet: "سفرة العائلة", amount: -600, kind: "تعويض", state: "بانتظار التسوية" },
  { date: "8 أغسطس", title: "فاتورة الكهرباء", member: "من صندوق المنزل", wallet: "مصاريف المنزل", amount: -42.6, kind: "مصروف", state: "معتمدة" },
  { date: "7 أغسطس", title: "راتب شهر أغسطس", member: "الحساب البنكي", wallet: "محفظتي الشخصية", amount: 1250, kind: "دخل", state: "معتمدة" },
  { date: "5 أغسطس", title: "قسط الجمعية", member: "محمد الرواحي", wallet: "جمعية الإخوة", amount: 200, kind: "مساهمة", state: "معتمدة" },
];

const people = [
  { name: "عبدالحميد الرواحي", role: "المالك والمدير", paid: 320, extra: 80, status: "منتظم", c: "#08765f" },
  { name: "أحمد الرواحي", role: "أمين الصندوق", paid: 280, extra: 40, status: "له 600 ر.ع", c: "#4466a5" },
  { name: "محمد الرواحي", role: "عضو", paid: 240, extra: 0, status: "منتظم", c: "#a96a29" },
  { name: "سالم الرواحي", role: "عضو", paid: 220, extra: 20, status: "متأخر 20 ر.ع", c: "#9b4654" },
  { name: "خالد الرواحي", role: "مشاهد", paid: 200, extra: 0, status: "منتظم", c: "#657b70" },
  { name: "ناصر الرواحي", role: "عضو", paid: 180, extra: 0, status: "متأخر 40 ر.ع", c: "#8663a6" },
];

export default function RifdApp() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [mode, setMode] = useState<Mode>("user");
  const [currency, setCurrency] = useState<Currency>("OMR");
  const [view, setView] = useState<View>("overview");
  const [modal, setModal] = useState<"transaction" | "wallet" | "invite" | null>(null);
  const [toast, setToast] = useState("");
  const [amount, setAmount] = useState("50");
  const [txFilter, setTxFilter] = useState("الكل");
  const isAr = lang === "ar";
  const curr = currencies[currency];
  const money = (value: number) => `${(value * curr.rate).toLocaleString(isAr ? "ar-OM" : "en-US", { minimumFractionDigits: currency === "BHD" || currency === "KWD" || currency === "OMR" ? 3 : 2, maximumFractionDigits: 3 })} ${curr.symbol}`;
  const flash = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2400); };
  const pageName = useMemo(() => ({overview:"لوحة القيادة",wallets:"المحافظ",transactions:"العمليات المالية",members:"الأعضاء والصلاحيات",reports:"التقارير والتحليلات",personal:"محفظتي الشخصية",home:"مصاريف المنزل",travel:"سفرة العائلة 2027",circle:"جمعية الإخوة"}[view]), [view]);

  return <main className="rifd" dir={isAr ? "rtl" : "ltr"}>
    <aside className="side">
      <div className="omani-stripe"><i/><i/><i/></div>
      <div className="logo"><span>ر</span><div><b>رِفد</b><small>RIFD · OMAN</small></div></div>
      {mode==="user" ? <nav>
        <Nav icon="⌂" label={isAr?"لوحة القيادة":"Dashboard"} active={view==="overview"} onClick={()=>setView("overview")}/>
        <Nav icon="▣" label={isAr?"المحافظ":"Wallets"} active={view==="wallets"} onClick={()=>setView("wallets")} badge="4"/>
        <Nav icon="⇄" label={isAr?"العمليات المالية":"Transactions"} active={view==="transactions"} onClick={()=>setView("transactions")}/>
        <Nav icon="♙" label={isAr?"الأعضاء والصلاحيات":"Members & roles"} active={view==="members"} onClick={()=>setView("members")}/>
        <Nav icon="▥" label={isAr?"التقارير والتحليلات":"Reports"} active={view==="reports"} onClick={()=>setView("reports")}/>
      </nav> : <nav className="admin-nav">
        <button className="active"><span>⌂</span>نظرة عامة</button><button><span>♙</span>المستخدمون والعملاء<b>1,248</b></button><button><span>▣</span>الباقات والاشتراكات</button><button><span>⌁</span>الكوبونات والخصومات</button><button><span>◉</span>المدفوعات والفواتير</button><button><span>⚿</span>الصلاحيات والأدوار</button><button><span>▥</span>التقارير والإيرادات</button><button><span>⚙</span>إعدادات المنصة</button>
      </nav>}
      {mode==="user" && <><p className="side-title">{isAr?"مساحاتي المالية":"MY FINANCIAL SPACES"}</p>
      <div className="space-list">{walletData.map(w=><button key={w.id} className={view===w.id?"on":""} onClick={()=>setView(w.id)}><i className={w.color}/><span>{isAr?w.title:({personal:"Personal wallet",home:"Home expenses",travel:"Family trip 2027",circle:"Family circle"} as Record<string,string>)[w.id]}</span></button>)}</div>
      <button className="side-create" onClick={()=>setModal("wallet")}>＋ {isAr?"إنشاء محفظة جديدة":"Create wallet"}</button></>}
      <div className="oman-note"><b>صُمم في عُمان</b><small>لأموال أوضح، وتعاون أوثق</small></div>
      <div className="account"><span>ع</span><div><b>عبدالحميد الرواحي</b><small>{isAr?"مالك الحساب":"Account owner"}</small></div><button>⋮</button></div>
    </aside>

    <section className="stage">
      <header className="topbar">
        <button className="hamb">☰</button>
        <div className="search">⌕ <input placeholder={isAr?"ابحث في رِفد...":"Search RIFD..."}/><kbd>⌘ K</kbd></div>
        <div className="mode-switch"><button className={mode==="user"?"on":""} onClick={()=>setMode("user")}>لوحة المستخدم</button><button className={mode==="admin"?"on":""} onClick={()=>setMode("admin")}>إدارة المنصة</button><button className={mode==="pricing"?"on":""} onClick={()=>setMode("pricing")}>الباقات</button></div>
        <div className="top-actions">
          <select aria-label="العملة" value={currency} onChange={e=>setCurrency(e.target.value as Currency)}>{Object.entries(currencies).map(([code,c])=><option key={code} value={code}>{c.flag} {code}</option>)}</select>
          <button onClick={()=>setLang(isAr?"en":"ar")}>{isAr?"EN":"ع"}</button>
          <button className="notify">♢<i/></button>
          <button className="main-action" onClick={()=>setModal("transaction")}>＋ {isAr?"إضافة عملية":"Add transaction"}</button>
        </div>
      </header>
      <div className="oman-ribbon"><span>جبال عُمان</span><b>إدارة مالية بروح عُمانية</b><span>البحر والصحراء</span></div>
      <div className="body">
        {mode==="admin" ? <AdminPanel money={money} flash={flash}/> : mode==="pricing" ? <PricingView flash={flash}/> : <>
        <div className="heading"><div><p>رِفد / {pageName}</p><h1>{pageName}</h1><span>{isAr?"مرحباً عبدالحميد، هذه خلاصة أموالك اليوم":"Welcome Abdul Hamid, here is your financial summary"}</span></div><div><button className="outline" onClick={()=>setModal("invite")}>↗ {isAr?"دعوة عضو":"Invite member"}</button><button className="date">◷ {isAr?"أغسطس 2026":"August 2026"}</button></div></div>
        <div className="currency-banner"><span>{curr.flag}</span><div><b>{isAr?curr.ar:curr.en}</b><small>{isAr?"جميع القيم معروضة بهذه العملة · أسعار التحويل استرشادية":"All values shown in this currency · indicative rates"}</small></div><em>{currency}</em></div>
        {view==="overview" && <Overview money={money} setView={setView}/>} 
        {view==="wallets" && <Wallets money={money} open={()=>setModal("wallet")} choose={setView}/>} 
        {view==="transactions" && <Transactions money={money} filter={txFilter} setFilter={setTxFilter}/>} 
        {view==="members" && <Members money={money} invite={()=>setModal("invite")}/>} 
        {view==="reports" && <Reports money={money} flash={flash}/>} 
        {view==="personal" && <Personal money={money}/>} 
        {view==="home" && <Home money={money}/>} 
        {view==="travel" && <Travel money={money} flash={flash}/>} 
        {view==="circle" && <Circle money={money} flash={flash}/>} 
        </>}
      </div>
    </section>
    {modal && <Modal type={modal} close={()=>setModal(null)} money={money} amount={amount} setAmount={setAmount} save={()=>{setModal(null);flash(isAr?"تم الحفظ بنجاح":"Saved successfully")}}/>}
    {toast&&<div className="toast">✓ {toast}</div>}
  </main>;
}

function Nav({icon,label,active,onClick,badge}:{icon:string,label:string,active:boolean,onClick:()=>void,badge?:string}){return <button className={active?"active":""} onClick={onClick}><span>{icon}</span>{label}{badge&&<b>{badge}</b>}</button>}
function Kpi({label,value,note,icon,tone="green"}:{label:string,value:string,note:string,icon:string,tone?:string}){return <article className="kpi"><div><span>{label}</span><i className={tone}>{icon}</i></div><strong>{value}</strong><small>{note}</small></article>}

function Overview({money,setView}:{money:(n:number)=>string,setView:(v:View)=>void}){return <>
  <div className="kpis"><Kpi label="صافي أموالي" value={money(5320)} note="+ 7.8% هذا الشهر" icon="◈"/><Kpi label="الدخل الشهري" value={money(1680)} note="3 مصادر دخل" icon="↙" tone="blue"/><Kpi label="المصروف الشهري" value={money(912.6)} note="54.3% من الدخل" icon="↗" tone="red"/><Kpi label="التزامات المجموعات" value={money(420)} note="3 دفعات قادمة" icon="◷" tone="amber"/></div>
  <div className="dashboard-grid"><section className="panel overview-wallets"><div className="panel-head"><div><h2>محافظي</h2><p>كل أموالك الشخصية والمشتركة في مكان واحد</p></div><button onClick={()=>setView("wallets")}>عرض الكل ←</button></div><div className="mini-wallets">{walletData.map(w=><button key={w.id} onClick={()=>setView(w.id)}><i className={w.color}>{w.icon}</i><div><b>{w.title}</b><small>{w.sub}</small></div><strong>{money(w.balance)}</strong><em>{w.trend}</em></button>)}</div></section><section className="panel spending"><div className="panel-head"><div><h2>توزيع المصروفات</h2><p>أغسطس 2026</p></div><button>•••</button></div><div className="donut"><div><b>{money(912.6)}</b><small>إجمالي المصروف</small></div></div><ul><li><i className="g"/> المنزل <b>38%</b></li><li><i className="a"/> الطعام <b>24%</b></li><li><i className="b"/> المواصلات <b>18%</b></li><li><i className="p"/> أخرى <b>20%</b></li></ul></section></div>
  <section className="panel recent"><div className="panel-head"><div><h2>آخر العمليات</h2><p>أحدث الحركات في جميع المحافظ</p></div><button onClick={()=>setView("transactions")}>عرض الكل ←</button></div><TransactionTable money={money} rows={txs.slice(0,4)}/></section>
  </>}

function Wallets({money,open,choose}:{money:(n:number)=>string,open:()=>void,choose:(v:View)=>void}){return <><div className="wallet-summary"><div><span>إجمالي الأرصدة</span><b>{money(8360)}</b><small>عبر 4 محافظ نشطة</small></div><div><span>الرصيد المشترك</span><b>{money(4100)}</b><small>لا يشمل أرصدة الأعضاء الخاصة</small></div><div><span>الأرصدة الشخصية الإضافية</span><b>{money(380)}</b><small>محفوظة لأصحابها</small></div></div><div className="wallet-grid">{walletData.map(w=><article key={w.id} className={`wallet-card ${w.color}`}><div className="wallet-top"><i>{w.icon}</i><button>•••</button></div><p>{w.sub}</p><h2>{w.title}</h2><strong>{money(w.balance)}</strong><div className="wallet-foot"><span>{w.trend}</span><button onClick={()=>choose(w.id)}>فتح المحفظة ←</button></div></article>)}<button className="add-wallet" onClick={open}><span>＋</span><b>إنشاء محفظة جديدة</b><small>شخصية، منزلية، سفر، جمعية أو مشروع</small></button></div><section className="panel templates"><div className="panel-head"><div><h2>قوالب جاهزة</h2><p>ابدأ خلال دقيقة بإعدادات مناسبة لنوع المحفظة</p></div></div><div className="template-row"><button>⌂<b>ميزانية منزل</b><small>دخل، فواتير ومصروفات</small></button><button>✈<b>رحلة جماعية</b><small>مساهمات وتسويات</small></button><button>◎<b>جمعية دورية</b><small>أقساط وأدوار وقرعة</small></button><button>◈<b>هدف ادخار</b><small>خطة وتوقعات ذكية</small></button></div></section></>}

function TransactionTable({money,rows}:{money:(n:number)=>string,rows:typeof txs}){return <div className="table-wrap"><table><thead><tr><th>العملية</th><th>المحفظة</th><th>التاريخ</th><th>النوع</th><th>الحالة</th><th>المبلغ</th></tr></thead><tbody>{rows.map((t,i)=><tr key={i}><td><b>{t.title}</b><small>{t.member}</small></td><td>{t.wallet}</td><td>{t.date}</td><td><span className="tag">{t.kind}</span></td><td><span className={t.state==="معتمدة"?"state ok":"state wait"}>{t.state}</span></td><td className={t.amount>0?"plus":"minus"}>{t.amount>0?"+ ":"− "}{money(Math.abs(t.amount))}</td></tr>)}</tbody></table></div>}
function Transactions({money,filter,setFilter}:{money:(n:number)=>string,filter:string,setFilter:(s:string)=>void}){const rows=filter==="الكل"?txs:txs.filter(t=>t.kind===filter);return <><div className="kpis compact"><Kpi label="إجمالي الداخل" value={money(1860)} note="هذا الشهر" icon="↙"/><Kpi label="إجمالي الخارج" value={money(992.6)} note="هذا الشهر" icon="↗" tone="red"/><Kpi label="بانتظار الاعتماد" value={money(600)} note="عملية واحدة" icon="◷" tone="amber"/></div><section className="panel"><div className="filterbar"><div>{["الكل","دخل","مصروف","مساهمة","تعويض"].map(x=><button className={filter===x?"on":""} key={x} onClick={()=>setFilter(x)}>{x}</button>)}</div><div><input placeholder="بحث في العمليات..."/><button>☷ تصفية</button><button>⇩ تصدير</button></div></div><TransactionTable money={money} rows={rows}/></section></>}

function Members({money,invite}:{money:(n:number)=>string,invite:()=>void}){return <><div className="member-top"><div><b>6</b><span>إجمالي الأعضاء</span></div><div><b>4</b><span>أعضاء منتظمون</span></div><div><b>2</b><span>لديهم متأخرات</span></div><div><b>{money(140)}</b><span>أرصدة شخصية محفوظة</span></div><button onClick={invite}>＋ دعوة عضو</button></div><section className="panel"><div className="panel-head"><div><h2>أعضاء سفرة العائلة 2027</h2><p>حدد ما يستطيع كل عضو مشاهدته أو تعديله</p></div><button>⚙ إدارة الصلاحيات</button></div><div className="people-grid">{people.map((p,i)=><article key={p.name}><span style={{background:p.c}}>{p.name[0]}</span><div><b>{p.name}</b><small>{p.role}</small></div><em className={p.status.includes("متأخر")?"late":""}>{p.status}</em><dl><div><dt>إجمالي المساهمة</dt><dd>{money(p.paid)}</dd></div><div><dt>الفائض الشخصي</dt><dd>{money(p.extra)}</dd></div></dl><div className="person-actions"><button>عرض الحساب</button><button>•••</button></div></article>)}</div></section><section className="roles"><article><i>♛</i><b>المالك</b><p>تحكم كامل وإغلاق المحفظة وتعيين المديرين</p></article><article><i>♜</i><b>أمين الصندوق</b><p>تسجيل المقبوضات والمصروفات والتسويات</p></article><article><i>✓</i><b>المُعتمد</b><p>الموافقة على العمليات الحساسة والكبيرة</p></article><article><i>◉</i><b>المدقق</b><p>قراءة السجلات والتقارير دون تعديل</p></article></section></>}

function Reports({money,flash}:{money:(n:number)=>string,flash:(s:string)=>void}){return <><div className="report-actions"><button className="active">شهري</button><button>ربع سنوي</button><button>سنوي</button><span/><button onClick={()=>flash("تم إعداد تقرير PDF")}>⇩ PDF</button><button onClick={()=>flash("تم إعداد ملف Excel")}>⇩ Excel</button></div><div className="report-grid"><section className="panel cashflow"><div className="panel-head"><div><h2>التدفق المالي</h2><p>الدخل مقابل المصروف خلال 6 أشهر</p></div></div><div className="bars">{[58,67,52,78,61,85].map((x,i)=><div key={i}><i style={{height:`${x}%`}}/><i style={{height:`${x*.55}%`}}/><span>{["مارس","أبريل","مايو","يونيو","يوليو","أغسطس"][i]}</span></div>)}</div><div className="legend"><span><i/> الدخل {money(9230)}</span><span><i/> المصروف {money(5412)}</span></div></section><section className="panel health"><h2>المؤشر المالي</h2><div className="health-ring"><b>82</b><small>ممتاز</small></div><ul><li>معدل الادخار <b>31%</b></li><li>الالتزام بالميزانية <b>89%</b></li><li>الدفعات في موعدها <b>94%</b></li></ul></section></div><div className="insights"><article><i>✦</i><div><b>ملاحظة ذكية</b><p>انخفض إنفاق المنزل 12% مقارنة بالشهر الماضي، بينما ارتفع بند السفر بسبب حجز التذاكر.</p></div></article><article><i>◎</i><div><b>فرصة ادخار</b><p>يمكنك توفير {money(35)} شهرياً بمراجعة ثلاثة اشتراكات متكررة.</p></div></article><article><i>!</i><div><b>تنبيه</b><p>مصروف الطعام وصل إلى 86% من ميزانيته قبل نهاية الشهر.</p></div></article></div></>}

function Personal({money}:{money:(n:number)=>string}){return <><div className="kpis"><Kpi label="الرصيد المتاح" value={money(2840)} note="3 حسابات" icon="◈"/><Kpi label="دخل أغسطس" value={money(1680)} note="الراتب + الإيجار" icon="↙"/><Kpi label="مصروف أغسطس" value={money(912.6)} note="ضمن الميزانية" icon="↗" tone="red"/><Kpi label="تم ادخاره" value={money(420)} note="25% من الدخل" icon="◇" tone="blue"/></div><div className="dual"><section className="panel"><div className="panel-head"><div><h2>ميزانية أغسطس</h2><p>المخطط مقابل المصروف الفعلي</p></div><button>تعديل الميزانية</button></div><Budget label="المنزل" spent={380} total={500} money={money}/><Budget label="الطعام" spent={214} total={250} money={money}/><Budget label="المواصلات" spent={126} total={200} money={money}/><Budget label="التسوق والترفيه" spent={192.6} total={300} money={money}/></section><section className="panel goals"><div className="panel-head"><div><h2>أهداف الادخار</h2><p>خطتك للأهداف المستقبلية</p></div><button>＋ هدف</button></div><Goal icon="✈" name="السفر" now={1240} goal={6000} money={money}/><Goal icon="▣" name="صندوق الطوارئ" now={2100} goal={3000} money={money}/><Goal icon="◆" name="سيارة جديدة" now={3800} goal={12000} money={money}/></section></div></>}
function Budget({label,spent,total,money}:{label:string,spent:number,total:number,money:(n:number)=>string}){return <div className="budget"><div><b>{label}</b><span>{money(spent)} من {money(total)}</span></div><i><em style={{width:`${spent/total*100}%`}}/></i></div>}
function Goal({icon,name,now,goal,money}:{icon:string,name:string,now:number,goal:number,money:(n:number)=>string}){return <div className="goal"><span>{icon}</span><div><b>{name}</b><small>{money(now)} من {money(goal)}</small><i><em style={{width:`${now/goal*100}%`}}/></i></div><strong>{Math.round(now/goal*100)}%</strong></div>}

function Home({money}:{money:(n:number)=>string}){return <><div className="home-hero"><div><small>ميزانية المنزل · أغسطس</small><b>{money(680)}</b><span>الرصيد المتبقي من {money(1500)}</span></div><div><small>الفواتير القادمة</small><b>4</b><span>أقربها الكهرباء بعد 3 أيام</span></div><div><small>مساهمات الأسرة</small><b>{money(1200)}</b><span>من 3 أفراد</span></div></div><div className="dual"><section className="panel"><div className="panel-head"><div><h2>مصروفات المنزل</h2><p>التوزيع حسب الفئة</p></div><button>＋ إضافة مصروف</button></div><Budget label="الإيجار" spent={450} total={450} money={money}/><Budget label="الكهرباء والمياه" spent={92} total={130} money={money}/><Budget label="المواد الغذائية" spent={168} total={300} money={money}/><Budget label="الصيانة" spent={110} total={200} money={money}/></section><section className="panel bills"><div className="panel-head"><div><h2>الفواتير المتكررة</h2><p>تذكير تلقائي قبل موعد الاستحقاق</p></div></div>{[["⚡","الكهرباء","15 أغسطس",42.6],["◉","الإنترنت","18 أغسطس",29],["◫","المياه","21 أغسطس",18],["⌂","صيانة التكييف","25 أغسطس",35]].map((b,i)=><div key={i}><span>{b[0]}</span><p><b>{b[1]}</b><small>{b[2]}</small></p><strong>{money(Number(b[3]))}</strong><button>دفع</button></div>)}</section></div></>}

function Travel({money,flash}:{money:(n:number)=>string,flash:(s:string)=>void}){return <><section className="trip-hero"><div><span>✈</span><p>الوجهة المتوقعة</p><h2>إسطنبول، تركيا</h2><small>يوليو 2027 · 6 مسافرين</small></div><div className="trip-goal"><span>تم جمع {money(1240)}</span><b>20.7%</b><i><em/></i><small>الهدف {money(6000)} · المتبقي {money(4760)}</small></div><button onClick={()=>flash("تم فتح إعدادات الرحلة")}>إدارة الرحلة</button></section><div className="kpis compact"><Kpi label="الصندوق المشترك" value={money(1100)} note="متاح للمصروفات" icon="▣"/><Kpi label="فوائض الأعضاء" value={money(140)} note="ملك لـ 3 أعضاء" icon="♙" tone="blue"/><Kpi label="مستحق لأحمد" value={money(600)} note="حجز تذاكر" icon="⇄" tone="amber"/></div><div className="dual"><section className="panel"><div className="panel-head"><div><h2>ميزانية الرحلة</h2><p>المتوقع مقابل المحجوز فعلياً</p></div><button>تعديل</button></div><Budget label="تذاكر الطيران" spent={600} total={1800} money={money}/><Budget label="السكن" spent={350} total={1600} money={money}/><Budget label="المواصلات" spent={0} total={700} money={money}/><Budget label="الطعام والأنشطة" spent={0} total={1400} money={money}/><Budget label="الطوارئ" spent={0} total={500} money={money}/></section><section className="panel settlement"><div className="panel-head"><div><h2>التسويات الذكية</h2><p>أقل عدد من التحويلات لتصفية الحساب</p></div></div><div className="settle-card"><span>أ</span><p><b>أحمد دفع من ماله</b><small>حجز تذاكر المجموعة</small></p><strong>له {money(600)}</strong></div><div className="settle-flow"><span>الصندوق المشترك</span><b>← {money(600)} ←</b><span>أحمد</span></div><button onClick={()=>flash("تم تسجيل تسوية أحمد")}>تسوية المبلغ وتوثيق التحويل</button></section></div></>}

function Circle({money,flash}:{money:(n:number)=>string,flash:(s:string)=>void}){return <><section className="circle-head"><div><small>جمعية دورية نشطة</small><h2>جمعية الإخوة</h2><p>6 أعضاء · {money(200)} شهرياً · 5 سنوات</p></div><div><span>الدور القادم</span><b>سالم الرواحي</b><small>1 سبتمبر 2026 · {money(1200)}</small></div><button onClick={()=>flash("تم فتح إعدادات الأدوار")}>⚙ إدارة الأدوار</button></section><div className="kpis compact"><Kpi label="إجمالي المحصل" value={money(3600)} note="من أصل 3,600" icon="↙"/><Kpi label="المتأخرات" value={money(60)} note="عضوان" icon="!" tone="red"/><Kpi label="التوزيعات" value={money(2400)} note="دوران مكتملان" icon="◎" tone="blue"/></div><div className="dual"><section className="panel"><div className="panel-head"><div><h2>جدول الأدوار</h2><p>النظام الحالي: ترتيب هرمي متناوب</p></div><button onClick={()=>flash("تم فتح القرعة الإلكترونية")}>✦ إجراء قرعة</button></div><div className="turns">{["عبدالحميد الرواحي","أحمد الرواحي","سالم الرواحي","محمد الرواحي","خالد الرواحي","ناصر الرواحي"].map((n,i)=><div className={i<2?"done":i===2?"next":""} key={n}><b>{i+1}</b><span>{n}</span><small>{i<2?"تم الاستلام":i===2?"الدور القادم":`${i-1} نوفمبر 2026`}</small><strong>{money(1200)}</strong></div>)}</div></section><section className="panel methods"><h2>طرق ترتيب الأدوار</h2><p>يمكن للمدير تغيير الطريقة وفق قواعد الجمعية</p>{[["☷","ترتيب يدوي"],["✦","قرعة إلكترونية موثقة"],["أ","ترتيب أبجدي"],["⇅","هرمي متناوب"],["◉","أولوية بعد التصويت"]].map((m,i)=><button className={i===3?"chosen":""} key={i}><span>{m[0]}</span>{m[1]}<i>{i===3?"مفعّل":"اختيار"}</i></button>)}</section></div></>}

function Modal({type,close,money,amount,setAmount,save}:{type:string,close:()=>void,money:(n:number)=>string,amount:string,setAmount:(s:string)=>void,save:()=>void}){return <div className="modal-bg" onMouseDown={close}><section className="modal" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={close}>×</button>{type==="transaction"&&<><small>عملية مالية جديدة</small><h2>تسجيل مساهمة عضو</h2><p>يفصل رِفد الالتزام الشهري عن المبلغ الإضافي تلقائياً.</p><label>العضو<select><option>عبدالحميد الرواحي</option><option>أحمد الرواحي</option><option>محمد الرواحي</option></select></label><label>المبلغ المستلم<div className="amount"><input value={amount} onChange={e=>setAmount(e.target.value)}/><span>ر.ع</span></div></label><label>تخصيص الزيادة<select><option>رصيد شخصي قابل للاسترداد</option><option>دفعة مقدمة للأشهر القادمة</option><option>مساهمة تطوعية للصندوق</option><option>مبلغ مخصص لهدف</option></select></label><div className="split"><span>اشتراك أغسطس <b>{money(20)}</b></span><span>فائض شخصي <b>{money(Math.max(0,Number(amount)-20))}</b></span></div></>}{type==="wallet"&&<><small>مساحة مالية جديدة</small><h2>ما الذي تريد إدارته؟</h2><p>اختر قالباً وسنجهز لك الحسابات والقواعد المناسبة.</p><div className="modal-types"><button>◈<b>محفظة شخصية</b></button><button>⌂<b>منزل وعائلة</b></button><button>✈<b>سفر ورحلة</b></button><button>◎<b>جمعية دورية</b></button><button>◆<b>مشروع مشترك</b></button><button>＋<b>قالب مخصص</b></button></div><label>العملة الأساسية<select>{Object.entries(currencies).map(([k,c])=><option key={k}>{c.flag} {c.ar} ({k})</option>)}</select></label></>}{type==="invite"&&<><small>إدارة الفريق</small><h2>دعوة عضو جديد</h2><p>سيصل للعضو رابط آمن، ولن يرى إلا البيانات التي تسمح بها.</p><label>البريد الإلكتروني أو رقم الهاتف<input placeholder="example@email.com"/></label><label>الصلاحية<select><option>عضو — يرى حسابه فقط</option><option>أمين صندوق — يسجل العمليات</option><option>مدير — يدير الأعضاء والإعدادات</option><option>مدقق — قراءة فقط</option></select></label><label>المحفظة<select><option>سفرة العائلة 2027</option><option>مصاريف المنزل</option><option>جمعية الإخوة</option></select></label></>}<button className="save" onClick={save}>{type==="invite"?"إرسال الدعوة":"حفظ ومتابعة"}</button></section></div>}
