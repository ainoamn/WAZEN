# Handoff — جلسة سبتمبر 2026 (محادثة كاملة)

**الغرض:** استئناف العمل من جهاز آخر — يلخّص كل ما طُلب ونُفّذ في هذه المحادثة.

**نقطة الدخول السريعة:** [CONTINUE-HERE.md](./CONTINUE-HERE.md)

**الفرع:** `main`  
**المستودع:** https://github.com/ainoamn/WAZEN  
**الإنتاج:** https://wazen.bhd-om.com  
**آخر commit لهذه المحادثة:** `3887e03` فما فوق على `main` (تحقق: `GET /api/health`)

**سجل المحادثة في Cursor (محلي فقط، غير مرفوع لـ Git):**  
`agent-transcripts/a6e70310-2e7c-417b-84ca-7238cf9d9dca/`

---

## على الجهاز الثاني — ابدأ هنا

```bash
git clone https://github.com/ainoamn/WAZEN.git
cd WAZEN
git pull origin main   # إن كان المستودع موجوداً
npm install
npm run build          # تأكد أن البناء ينجح محلياً
npm run test:backend   # اختياري — يشمل member-statement-email.test.mjs
```

لا ترفع `public/brand/*-with-bg.png` (غير متتبعة عمداً).

---

## تسلسل طلبات المستخدم (الأقدم → الأحدث)

| # | الطلب | الحالة |
|---|--------|--------|
| 1 | إصلاح محاسبة **عليه/له** — عضو دفع 200 وحصة صندوق 165.5 → **34.5 له** لا 165.5 عليه | ✅ `f03a20f` (قبل هذه الجلسة) |
| 2 | commit + push + توثيق المحاسبة | ✅ |
| 3 | إصلاح **تسجيل الخروج** — إعادة دخول SSO فوراً | ✅ `d07252f` |
| 4 | تفعيل **واتساب/SMS** للدعوات عند ضبط env | ✅ `42bd936` |
| 5 | أين `WHATSAPP_PHONE_NUMBER_ID`؟ + أفضل SMS لعُمان | ✅ إجابة (بدون كود) |
| 6 | عند **معاملة جديدة** → بريد لكل الأعضاء: كشف + «عليك للجمعية …» + إرسال يدوي | ✅ `2117bc3` |
| 7 | ادفع ووثّق وانشر | ✅ |
| 8 | فشل Vercel على `2117bc3`/`64a5e8d` — صحّح وارفع | ✅ `846ec4e` + `4f51388` |
| 9 | ارفع المحادثة كلها في git للرجوع من جهاز ثانٍ | ✅ `3887e03` + هذا الملف |
| 10 | تأكيد: ارفع كل شيء لـ Git ليعرف الجهاز الثاني ما تم | ✅ `docs/CONTINUE-HERE.md` + تحديث هذا الملف |

---

## Commits ذات صلة (ترتيب زمني)

```
f03a20f  Net fund expense shares against paid contributions.
d07252f  Fix logout bouncing back into SSO sign-in.
42bd936  Add WhatsApp Cloud API and SMS invite delivery.
2117bc3  Email member statements automatically after group transactions.
64a5e8d  Document member statement email feature in handoff and launch checklist.
846ec4e  Fix TypeScript errors blocking Vercel deploy for statement emails.
4f51388  Document Vercel build fix for member statement emails (846ec4e).
3887e03  Add full session handoff doc for continuing work on another device.
```

*(commits اللاحقة لتحديث CONTINUE-HERE تُضاف على `main` فوق هذا.)*

---

## 1. إصلاح عليه/له (مصروف الصندوق)

**القاعدة:** حصة مصروف **من صندوق الجمعية** تُصفّى مقابل `paid_minor`:
- مدفوع − حصص > 0 → **له**
- حصص − مدفوع > 0 → فرق في **عليه**
- لا تضاعف مع تسويات عجز الصندوق

| ملف | الدور |
|-----|--------|
| `lib/finance.ts` | `memberFundPoolNet`, `isFundPaidExpense`, `memberExtraCreditMinor` |
| `lib/member-ledger.ts` | كشف العضو |
| `app/wazen-dashboard.tsx` | `memberPosition`, جدول الأعضاء |
| `tests/member-ledger.test.mjs` | حالات 34.5 له / عجز |

---

## 2. إصلاح الخروج (SSO loop)

**المشكلة:** بعد logout، `/home` يستدعي sign-in بينما جلسة BHD حية → دخول فوري.

**الحل:** `lib/client-logout.ts` — الخروج إلى `end-session` فقط، بدون redirect لـ sign-in.

| ملف |
|-----|
| `lib/client-logout.ts` |
| `app/home/home-client.tsx` |
| `app/wazen-dashboard.tsx` |

---

## 3. واتساب + SMS للدعوات

**جديد:** `lib/messaging-provider.ts` · جدول `message_outbox` · `SCHEMA_VERSION = 25`

عند دعوة عضو برقم هاتف + env مضبوط → طابور WA/SMS + تصريف في `/api/jobs/tick`.

### متغيرات Vercel (لا تلصق الأسرار في git)

| القناة | المتغيرات |
|--------|-----------|
| واتساب | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, اختياري `WHATSAPP_INVITE_TEMPLATE` |
| SMS Twilio | `TWILIO_*` |
| SMS Unifonic | `UNIFONIC_*` |
| بريد | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |

**WHATSAPP_PHONE_NUMBER_ID:** Meta Developer → App → WhatsApp → API Setup → Phone number ID تحت «From».

**SMS عُمان:** لا SMS مجاني؛ Unifonic للمنطقة؛ Twilio ~$0.22/SMS؛ الأرخص غالباً مزود محلي. يُفضّل WhatsApp Cloud للدعوات.

انظر: `docs/MEMBER-INVITES.md` · `docs/PRODUCTION-DEPLOYMENT.md` · `.env.example`

---

## 4. بريد كشف الحساب بعد المعاملات (العمل الرئيسي لهذه الجلسة)

### السلوك

عند `addTransaction` أو `addTripExpense` في محفظة جماعية → بريد **تلقائي** لكل عضو نشط لديه email.

كل بريد (`member_statement`):
- تحية مهذبة + اسم المحفظة
- **تنبيه:** «عليك للجمعية مبلغ X» / «له» / «متوازن»
- **ملخص كشف** (جدول + المدفوع/عليه/له)
- **زر + رابط** `/s/{token}` للكشف التفصيلي
- ذكر المعاملة الجديدة (وصف، مبلغ، تاريخ)

**يدوي:** صف المعاملة → أيقونة 📧 → `MemberStatementEmailModal` → «إرسال الكشف بالبريد».

**API يدوي:** `POST /api/dashboard` · `action: "sendMemberStatementEmails"` · `{ spaceId, transactionId?, memberId?, locale? }`

### الملفات

| ملف | الدور |
|-----|--------|
| `lib/member-statement-email.ts` | تحميل ledger، طابور، flush |
| `lib/member-statement-email-content.ts` | HTML التنبيه والجدول (بدون DB) |
| `lib/email-template-catalog.ts` | قالب `member_statement` |
| `lib/email-provider.ts` | CTA «عرض الكشف التفصيلي» |
| `app/api/dashboard/route.ts` | hooks + `sendMemberStatementEmails` |
| `app/wazen-dashboard.tsx` | زر 📧 في `TransactionRow` |
| `components/members/association-members.tsx` | `MemberStatementEmailModal` |
| `tests/member-statement-email.test.mjs` | 4 اختبارات |

**متطلبات:** باقة `email` · Resend أو webhook · email لكل عضو · cron `/api/jobs/tick`

**تفاصيل:** [MEMBER-STATEMENT-EMAIL.md](./MEMBER-STATEMENT-EMAIL.md)

### فشل Vercel (تم الإصلاح)

`2117bc3` و `64a5e8d` فشلا في `npm run build`:

1. `app/api/dashboard/route.ts` — نوع `notification` لا يقبل `statementsQueued` / `statementsSkipped` / `spaceId`
2. `lib/member-statement-email.ts` — `addon_minor: number | null` vs `undefined`

**الإصلاح:** `846ec4e` — توسيع نوع notification + `addon_minor: member.addon_minor ?? undefined`

---

## 5. ما لم يُنفّذ / اختياري للمتابعة

- [ ] ضبط env واتساب/SMS على Vercel للإنتاج (المستخدم يختار المزود)
- [ ] اختبار E2E: معاملة حقيقية → وصول بريد للأعضاء
- [ ] بريد كشف من **بطاقة العضو** (حالياً واتساب فقط عبر `createMemberStatementShare`)
- [ ] مزود SMS محلي عُمان إن رُغب بخلاف Twilio/Unifonic
- [ ] commit ملفات brand `*-with-bg.png` إن احتُجت (حالياً مستبعدة)

---

## 6. تحقق سريع بعد السحب

```bash
# بناء
npm run build

# اختبار بريد الكشف
node --experimental-strip-types --test tests/member-statement-email.test.mjs

# إنتاج
curl -s https://wazen.bhd-om.com/api/health
# buildId يجب أن يكون حديثاً (بعد 3887e03 أو أحدث)
```

**اختبار يدوي في اللوحة:**
1. محفظة جماعية + أعضاء ببريد
2. أضف معاملة → تحقق `email_outbox` أو البريد
3. زر 📧 على صف المعاملة → إرسال يدوي

---

## 7. مراجع توثيق

| مستند | محتوى |
|--------|--------|
| [CONTINUE-HERE.md](./CONTINUE-HERE.md) | **ابدأ هنا** على الجهاز الثاني |
| [HANDOFF-2026-08-30.md](./HANDOFF-2026-08-30.md) | handoff تراكمي (محاسبة، خروج، WA/SMS، بريد الكشف) |
| [MEMBER-STATEMENT-EMAIL.md](./MEMBER-STATEMENT-EMAIL.md) | دليل بريد الكشف |
| [MEMBER-INVITES.md](./MEMBER-INVITES.md) | دعوات + WA/SMS |
| [PRODUCTION-DEPLOYMENT.md](./PRODUCTION-DEPLOYMENT.md) | env + cron + قوالب بريد |
| [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md) | قائمة الإطلاق |

---

## 8. رسالة للوكيل/المطور على الجهاز الثاني

> اسحب `main` واقرأ أولاً `docs/CONTINUE-HERE.md` ثم هذا الملف.  
> الميزة الأخيرة: **بريد كشف الحساب التلقائي/اليدوي** بعد المعاملات الجماعية (`member_statement`).  
> لا تعِد تنفيذ المحاسبة أو الخروج أو WA/SMS للدعوات أو بريد الكشف — كلها مدمجة ومنشورة.  
> إن طُلب اختبار أو تفعيل مزودات → ركّز على env في Vercel والتحقق اليدوي.  
> لا ترفع `public/brand/*-with-bg.png` إلا بطلب صريح.

---

*آخر تحديث: 3 سبتمبر 2026 — جلسة Cursor Agent*
