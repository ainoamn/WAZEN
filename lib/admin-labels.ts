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
  "document.created": ["إنشاء مستند", "Document created"],
  "member.invited": ["دعوة عضو", "Member invited"],
  "member.invite_accepted": ["قبول دعوة", "Invite accepted"],
  "security.api_key_created": ["إنشاء مفتاح API", "API key created"],
  "security.api_key_revoked": ["إلغاء مفتاح API", "API key revoked"],
  "payment_provider.updated": ["تحديث مزوّد الدفع", "Payment provider updated"],
};

const ENTITIES: Record<string, Pair> = {
  user: ["مستخدم", "User"],
  plan: ["باقة", "Plan"],
  payment: ["دفعة", "Payment"],
  payment_gateway: ["بوابة دفع", "Payment gateway"],
  coupon: ["كوبون", "Coupon"],
  subscription: ["اشتراك", "Subscription"],
  document: ["مستند", "Document"],
  invite: ["دعوة", "Invite"],
  api_key: ["مفتاح API", "API key"],
  wallet: ["محفظة", "Wallet"],
  tenant: ["مستأجر", "Tenant"],
  member: ["عضو", "Member"],
  data_request: ["طلب بيانات", "Data request"],
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
  return pick(COUNTRIES, value, locale);
}

export function methodListLabel(values: unknown, locale: UiLocale) {
  if (!Array.isArray(values) || !values.length) return "—";
  return values.map((item) => methodLabel(String(item), locale)).join(" · ");
}

const ERRORS: Record<string, Pair> = {
  SAVE: ["تعذر الحفظ", "Could not save"],
  LOAD: ["تعذر التحميل", "Could not load"],
  FORBIDDEN: ["لا تملك صلاحية", "Forbidden"],
  ACTION_FAILED: ["فشل الإجراء", "Action failed"],
  INVALID_PLAN: ["بيانات الباقة غير صالحة", "Invalid plan data"],
  GATEWAY_NOT_FOUND: ["البوابة غير موجودة", "Gateway not found"],
};

export function errorLabel(value: string, locale: UiLocale) {
  return pick(ERRORS, value, locale);
}
