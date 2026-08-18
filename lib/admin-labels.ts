export type UiLocale = "ar" | "en";

type Pair = [string, string];

function pick(pairs: Record<string, Pair>, key: string, locale: UiLocale): string {
  const pair = pairs[key];
  if (pair) return pair[locale === "ar" ? 0 : 1];
  return key;
}

const ROLES: Record<string, Pair> = {
  super_admin: ["مدير المنصة", "Super admin"],
  admin: ["مدير", "Admin"],
  finance: ["مالية", "Finance"],
  support: ["دعم", "Support"],
  customer: ["عميل", "Customer"],
  owner: ["مالك", "Owner"],
  member: ["عضو", "Member"],
  manager: ["مدير مساحة", "Manager"],
};

const STATUSES: Record<string, Pair> = {
  active: ["نشط", "Active"],
  trialing: ["تجريبي", "Trial"],
  suspended: ["موقوف", "Suspended"],
  closed: ["مغلق", "Closed"],
  cancelled: ["ملغى", "Cancelled"],
  paid: ["مدفوعة", "Paid"],
  pending: ["معلقة", "Pending"],
  pending_payment: ["بانتظار الدفع", "Awaiting payment"],
  succeeded: ["ناجحة", "Succeeded"],
  failed: ["فاشلة", "Failed"],
  refunded: ["مستردة", "Refunded"],
  issued: ["صادر", "Issued"],
  settled: ["مُسوّاة", "Settled"],
  unsettled: ["غير مُسوّاة", "Unsettled"],
  complete: ["مكتمل", "Complete"],
  revoked: ["ملغى", "Revoked"],
};

const METHODS: Record<string, Pair> = {
  bank_transfer: ["تحويل بنكي", "Bank transfer"],
  card: ["بطاقة", "Card"],
  cash: ["نقد", "Cash"],
  other: ["أخرى", "Other"],
  apple_pay: ["آبل باي", "Apple Pay"],
  google_pay: ["جوجل باي", "Google Pay"],
  paypal: ["باي بال", "PayPal"],
  knet: ["كي نت", "KNET"],
  mada: ["مدى", "Mada"],
};

const ACTIONS: Record<string, Pair> = {
  "customer.status_changed": ["تغيير حالة العميل", "Customer status changed"],
  "admin.sessions_revoked": ["إلغاء جلسات المستخدم", "User sessions revoked"],
  "admin.role_changed": ["تغيير دور إداري", "Admin role changed"],
  "admin.email_verified_manual": ["تفعيل البريد يدوياً", "Email verified manually"],
  "admin.user_profile_updated": ["تحديث ملف المستخدم", "User profile updated"],
  "payment.status_changed": ["تغيير حالة الدفع", "Payment status changed"],
  "coupon.created": ["إنشاء كوبون", "Coupon created"],
  "gateway.updated": ["تحديث بوابة دفع", "Payment gateway updated"],
  "plan.upserted": ["حفظ الباقة", "Plan saved"],
  "subscription.admin_updated": ["تعديل الاشتراك", "Subscription updated"],
  "subscription.plan_selected": ["اختيار باقة", "Plan selected"],
  "subscription.upgrade_applied": ["تفعيل ترقية الباقة", "Plan upgrade applied"],
  "subscription.downgrade_scheduled": ["جدولة تخفيض الباقة", "Plan downgrade scheduled"],
  "subscription.downgrade_applied": ["تطبيق تخفيض الباقة", "Plan downgrade applied"],
  "subscription.retention_grace_started": ["بدء مهلة الاحتفاظ 15 يوماً", "15-day retention grace started"],
  "subscription.expired_to_starter": ["انتهاء الاشتراك إلى البداية", "Subscription expired to starter"],
  "wallet.retention_removed": ["إزالة محفظة بعد المهلة", "Wallet removed after grace"],
  "wallet.retention_restored": ["استرجاع محفظة من الأرشيف", "Wallet restored from archive"],
  "document.created": ["إنشاء مستند", "Document created"],
  "member.invited": ["دعوة عضو", "Member invited"],
  "member.invite_accepted": ["قبول دعوة", "Invite accepted"],
  "security.api_key_created": ["إنشاء مفتاح API", "API key created"],
  "security.api_key_revoked": ["إلغاء مفتاح API", "API key revoked"],
  "payment_provider.updated": ["تحديث مزوّد الدفع", "Payment provider updated"],
  "privacy.export_requested": ["طلب تصدير البيانات", "Data export requested"],
  "privacy.delete_requested": ["طلب حذف البيانات", "Data deletion requested"],
  "wallet.created": ["إنشاء محفظة", "Wallet created"],
  "wallet.updated": ["تحديث محفظة", "Wallet updated"],
  "wallet.deleted": ["حذف محفظة", "Wallet deleted"],
  "wallet.archived": ["أرشفة محفظة", "Wallet archived"],
  "wallet.unarchived": ["إلغاء أرشفة محفظة", "Wallet unarchived"],
  "wallet.reset": ["تصفير محفظة", "Wallet reset"],
  "wallet.linked": ["ربط محفظة", "Wallet linked"],
  "wallet.unlinked": ["فك ربط محفظة", "Wallet unlinked"],
  "wallet.bank_linked": ["ربط حساب بنكي", "Bank account linked"],
  "wallet.bank_unlinked": ["فك ربط حساب بنكي", "Bank account unlinked"],
  "wallet.transfer": ["تحويل بين المحافظ", "Wallet transfer"],
  "transaction.voided": ["إلغاء حركة", "Transaction voided"],
  "trip.expense_resplit": ["إعادة تقسيم المصروف", "Trip expense resplit"],
  "personal.account_added": ["إضافة حساب شخصي", "Personal account added"],
  "personal.account_updated": ["تحديث حساب شخصي", "Personal account updated"],
};

const ENTITIES: Record<string, Pair> = {
  user: ["مستخدم", "User"],
  plan: ["باقة", "Plan"],
  payment: ["دفعة", "Payment"],
  payment_gateway: ["بوابة دفع", "Payment gateway"],
  payment_provider: ["مزوّد دفع", "Payment provider"],
  coupon: ["كوبون", "Coupon"],
  subscription: ["اشتراك", "Subscription"],
  document: ["مستند", "Document"],
  invite: ["دعوة", "Invite"],
  api_key: ["مفتاح API", "API key"],
  wallet: ["محفظة", "Wallet"],
  tenant: ["مستأجر", "Tenant"],
  member: ["عضو", "Member"],
  data_request: ["طلب بيانات", "Data request"],
  invoice: ["فاتورة", "Invoice"],
  space: ["محفظة", "Wallet"],
  personal_account: ["حساب شخصي", "Personal account"],
  transaction: ["حركة", "Transaction"],
};

const SPACE_TYPES: Record<string, Pair> = {
  personal: ["شخصية", "Personal"],
  household: ["منزل", "Household"],
  trip: ["سفر", "Travel"],
  society: ["جمعية", "Circle"],
  group: ["مجموعة", "Group"],
};

const CYCLES: Record<string, Pair> = {
  monthly: ["شهري", "Monthly"],
  annual: ["سنوي", "Annual"],
};

const COUNTRIES: Record<string, Pair> = {
  OM: ["عُمان", "Oman"],
  SA: ["السعودية", "Saudi Arabia"],
  AE: ["الإمارات", "UAE"],
  KW: ["الكويت", "Kuwait"],
  BH: ["البحرين", "Bahrain"],
  QA: ["قطر", "Qatar"],
  EG: ["مصر", "Egypt"],
  JO: ["الأردن", "Jordan"],
  IQ: ["العراق", "Iraq"],
  YE: ["اليمن", "Yemen"],
  US: ["الولايات المتحدة", "United States"],
  GB: ["بريطانيا", "United Kingdom"],
  IN: ["الهند", "India"],
  PK: ["باكستان", "Pakistan"],
};

const SCOPES: Record<string, Pair> = {
  local: ["محلية", "Local"],
  regional: ["إقليمية", "Regional"],
  global: ["عالمية", "Global"],
};

const CSV_HEADERS: Record<string, Pair> = {
  id: ["المعرّف", "ID"],
  email: ["البريد", "Email"],
  display_name: ["الاسم", "Name"],
  created_at: ["تاريخ الإنشاء", "Created at"],
  status: ["الحالة", "Status"],
  country: ["الدولة", "Country"],
  last_seen_at: ["آخر نشاط", "Last seen"],
  subscription_status: ["حالة الاشتراك", "Subscription"],
  plan_name: ["الباقة", "Plan"],
  plan_id: ["معرّف الباقة", "Plan ID"],
  current_period_start: ["بداية الباقة", "Plan start"],
  current_period_end: ["نهاية الباقة", "Plan end"],
  amount_minor: ["المبلغ (بيسة)", "Amount (baisa)"],
  total_minor: ["الإجمالي (بيسة)", "Total (baisa)"],
  currency: ["العملة", "Currency"],
  reference: ["المرجع", "Reference"],
  method: ["الطريقة", "Method"],
  settlement_status: ["التسوية", "Settlement"],
  occurred_at: ["تاريخ العملية", "Occurred at"],
  user_id: ["معرّف المستخدم", "User ID"],
  role: ["الدور", "Role"],
  name_ar: ["الاسم عربي", "Arabic name"],
  name_en: ["الاسم إنجليزي", "English name"],
  monthly_minor: ["شهري (بيسة)", "Monthly (baisa)"],
  annual_minor: ["سنوي (بيسة)", "Annual (baisa)"],
  code: ["الرمز", "Code"],
  value: ["القيمة", "Value"],
  used_count: ["المستخدم", "Used"],
  usage_limit: ["حد الاستخدام", "Usage limit"],
  is_active: ["نشط", "Active"],
};

export function roleLabel(value: string, locale: UiLocale) {
  return pick(ROLES, value, locale);
}

export function statusLabel(value: string, locale: UiLocale) {
  return pick(STATUSES, value, locale);
}

export function methodLabel(value: string, locale: UiLocale) {
  return pick(METHODS, value, locale);
}

export function actionLabel(value: string, locale: UiLocale) {
  return pick(ACTIONS, value, locale);
}

export function entityLabel(value: string, locale: UiLocale) {
  return pick(ENTITIES, value, locale);
}

export function spaceTypeLabel(value: string, locale: UiLocale) {
  return pick(SPACE_TYPES, value, locale);
}

export function cycleLabel(value: string, locale: UiLocale) {
  return pick(CYCLES, value, locale);
}

export function countryLabel(value: string, locale: UiLocale) {
  return pick(COUNTRIES, value.toUpperCase(), locale);
}

export function scopeLabel(value: string, locale: UiLocale) {
  return pick(SCOPES, value, locale);
}

export function csvHeaderLabel(value: string, locale: UiLocale) {
  return pick(CSV_HEADERS, value, locale);
}

export function methodListLabel(values: unknown, locale: UiLocale) {
  if (!Array.isArray(values) || !values.length) return "—";
  return values.map((item) => methodLabel(String(item), locale)).join(" · ");
}

export function formatAdminDate(value: unknown, locale: UiLocale, withTime = false) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  const tag = locale === "ar" ? "ar-OM" : "en-GB";
  return withTime ? date.toLocaleString(tag) : date.toLocaleDateString(tag);
}

const ERRORS: Record<string, Pair> = {
  SAVE: ["تعذر الحفظ", "Could not save"],
  LOAD: ["تعذر التحميل", "Could not load"],
  FORBIDDEN: ["لا تملك صلاحية", "Forbidden"],
  ACTION_FAILED: ["فشل الإجراء", "Action failed"],
  INVALID_PLAN: ["بيانات الباقة غير صالحة", "Invalid plan data"],
  GATEWAY_NOT_FOUND: ["البوابة غير موجودة", "Gateway not found"],
  SAVE_FAILED: ["تعذر الحفظ", "Could not save"],
  REVOKE_FAILED: ["تعذر إلغاء الجلسات", "Could not revoke sessions"],
  VERIFY_FAILED: ["تعذر تفعيل البريد", "Could not verify email"],
  PLAN_REQUIRED: ["اختر باقة أولاً", "Choose a plan first"],
  INVALID_SUBSCRIPTION_UPDATE: ["بيانات الاشتراك غير صالحة", "Invalid subscription data"],
  SUBSCRIPTION_NOT_FOUND: ["تعذر العثور على الاشتراك أو الباقة", "Subscription or plan not found"],
  NO_CREDENTIALS: ["لا توجد بيانات دخول لهذا المستخدم", "User has no login credentials"],
  CANNOT_SUSPEND_SELF: ["لا يمكن إيقاف حسابك أنت", "You cannot suspend your own account"],
  INVALID_USER_UPDATE: ["بيانات الحساب غير صالحة", "Invalid account data"],
  BOOTSTRAP_FAILED: ["تعذر إكمال التهيئة", "Could not complete setup"],
  FAILED: ["فشل الإجراء", "Action failed"],
  PLAN_RECORD_LIMIT: ["وصلت إلى حد السجلات في باقتك", "You reached the record limit on your plan"],
  PLAN_FEATURE_REQUIRED: ["هذه الميزة تحتاج ترقية الباقة", "This feature needs a plan upgrade"],
  PLAN_DAILY_TRANSACTION_LIMIT: ["وصلت إلى حد المعاملات اليومية في باقتك", "You reached the daily transaction limit on your plan"],
  PLAN_MONTHLY_TRANSACTION_LIMIT: ["وصلت إلى حد المعاملات الشهرية في باقتك", "You reached the monthly transaction limit on your plan"],
  PLAN_PRINT_LIMIT: ["وصلت إلى حد المطبوعات في باقتك هذا الشهر", "You reached this month’s print limit on your plan"],
  INVALID_PLAN_SELECTION: ["بيانات اختيار الباقة غير مكتملة", "Plan selection details are incomplete"],
  PLAN_NOT_FOUND: ["الباقة غير موجودة", "Plan not found"],
  INVOICE_NOT_FOUND: ["الفاتورة غير موجودة", "Invoice not found"],
  INVOICE_NOT_PAYABLE: ["لا يمكن دفع هذه الفاتورة الآن", "This invoice cannot be paid now"],
  INTERNAL_ERROR: ["تعذر إكمال الطلب. حاول مرة أخرى", "Could not complete the request. Try again"],
};

export function errorLabel(value: string, locale: UiLocale) {
  return pick(ERRORS, value, locale);
}
