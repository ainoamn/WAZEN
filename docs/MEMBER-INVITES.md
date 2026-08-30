# دعوات الأعضاء (Member invites)

تاريخ التحديث: 2026-08-30 · الفرع: `main`

## التدفق للمستخدم المدعو

1. يفتح رابط الدعوة من البريد: `/invite?token=…`
2. تظهر ملاحظة تثبيت التطبيق (PWA) إن لزم.
3. نموذج انضمام: الاسم + الهاتف + البريد (مثبت من الدعوة) + كلمة المرور.
4. إذا كان البريد مسجّلاً مسبقاً: تنبيه + إرسال رابط إعادة كلمة المرور، ثم العودة للدعوة لإكمال القبول.
5. إذا كانت الجلسة تطابق بريد الدعوة: قبول تلقائي ثم التحويل إلى `/home`.

واجهات عامة (بدون جلسة إلزامية للانضمام):

- `POST /api/platform` · `action=peekInvite`
- `POST /api/platform` · `action=joinInvite`

## إعادة إرسال الدعوة (من لوحة المالك)

- الزر: ملف العضو → **إعادة إرسال الدعوة**
- API: `POST /api/dashboard` · `action=resendMemberInvite` · `{ memberId }`
- صلاحية: `members:write` على المحفظة
- حد المعدل: **مرة كل 6 ساعات** لنفس `(spaceId, email)` — رمز الخطأ `INVITE_RESEND_COOLDOWN` مع `nextEligibleAt`
- بعد قبول الدعوة وربط `members.user_id` (أو حالة invite=`accepted`): **ممنوع** — `INVITE_ALREADY_ACCEPTED`
- بدون بريد على سجل العضو: `INVITE_EMAIL_REQUIRED`

التنفيذ: `lib/member-invite.ts` (`sendSpaceMemberInvite`, `resendSpaceMemberInvite`).

## صلاحيات المدعو مقابل الباقة

- إنشاء محافظ غير شخصية يبقى على باقة **المالك**.
- المدعو على الباقة المجانية: يرى محافظ الدعوة ويستطيع **الاطلاع والإضافة** (`member` + `transact`).
- طباعة التقارير/الفواتير/المستندات: تتطلب دورًا أعلى (`owner` / `manager` / `treasurer`) **و** ميزة طباعة على باقة **المدعو** نفسه (`statements` / `documents` / `downloads`).

مرجع الكود: `lib/authorization.ts`, `lib/plan-features.ts` (`canPrintSpaceArtifacts`), `lib/plan-retention.ts` (`filterSpacesForPlanAccess` مع استثناء ضيوف الدعوة).
