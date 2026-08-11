import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  locale: text("locale").notNull().default("ar"),
  currency: text("currency").notNull().default("SAR"),
  createdAt: text("created_at").notNull(),
});

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  type: text("type").notNull(),
  currency: text("currency").notNull().default("SAR"),
  balanceMinor: integer("balance_minor").notNull().default(0),
  goalMinor: integer("goal_minor").notNull().default(0),
  accent: text("accent").notNull().default("emerald"),
  createdAt: text("created_at").notNull(),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").notNull(),
  userId: text("user_id"),
  displayName: text("display_name").notNull(),
  email: text("email"),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  dueMinor: integer("due_minor").notNull().default(0),
  paidMinor: integer("paid_minor").notNull().default(0),
  extraMinor: integer("extra_minor").notNull().default(0),
  avatar: text("avatar").notNull().default("#0f766e"),
  joinedAt: text("joined_at").notNull(),
});

export const contributionPlans = sqliteTable("contribution_plans", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  interval: text("interval").notNull().default("monthly"),
  dueDay: integer("due_day").notNull().default(1),
  extraPolicy: text("extra_policy").notNull().default("personal_reserve"),
  startsAt: text("starts_at").notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").notNull(),
  userId: text("user_id").notNull(),
  memberId: text("member_id"),
  kind: text("kind").notNull(),
  allocation: text("allocation").notNull().default("general"),
  amountMinor: integer("amount_minor").notNull(),
  descriptionAr: text("description_ar").notNull(),
  descriptionEn: text("description_en").notNull(),
  status: text("status").notNull().default("approved"),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const platformRoles = sqliteTable("platform_roles", {
  userId: text("user_id").primaryKey(),
  role: text("role").notNull().default("customer"),
  permissionsJson: text("permissions_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const customerProfiles = sqliteTable("customer_profiles", {
  userId: text("user_id").primaryKey(),
  status: text("status").notNull().default("active"),
  country: text("country").notNull().default("SA"),
  phone: text("phone"),
  lastSeenAt: text("last_seen_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionAr: text("description_ar").notNull(),
  descriptionEn: text("description_en").notNull(),
  monthlyMinor: integer("monthly_minor").notNull().default(0),
  annualMinor: integer("annual_minor").notNull().default(0),
  walletLimit: integer("wallet_limit").notNull().default(1),
  memberLimit: integer("member_limit").notNull().default(2),
  featuresJson: text("features_json").notNull().default("[]"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  planId: text("plan_id").notNull(),
  status: text("status").notNull().default("trialing"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  currentPeriodStart: text("current_period_start").notNull(),
  currentPeriodEnd: text("current_period_end").notNull(),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  subscriptionId: text("subscription_id"),
  reference: text("reference").notNull().unique(),
  subtotalMinor: integer("subtotal_minor").notNull(),
  discountMinor: integer("discount_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull(),
  currency: text("currency").notNull().default("SAR"),
  status: text("status").notNull().default("pending"),
  dueAt: text("due_at").notNull(),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull(),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  invoiceId: text("invoice_id"),
  reference: text("reference").notNull().unique(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("SAR"),
  method: text("method").notNull().default("bank_transfer"),
  status: text("status").notNull().default("pending"),
  settlementStatus: text("settlement_status").notNull().default("unsettled"),
  occurredAt: text("occurred_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const coupons = sqliteTable("coupons", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull().default("percent"),
  value: integer("value").notNull(),
  usageLimit: integer("usage_limit").notNull().default(100),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: text("expires_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  spaceId: text("space_id"),
  type: text("type").notNull(),
  reference: text("reference").notNull().unique(),
  personName: text("person_name").notNull(),
  description: text("description").notNull(),
  amountMinor: integer("amount_minor").notNull().default(0),
  currency: text("currency").notNull().default("SAR"),
  status: text("status").notNull().default("issued"),
  paymentMethod: text("payment_method").notNull().default("bank_transfer"),
  approvedBy: text("approved_by"),
  issuedAt: text("issued_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const documentSequences = sqliteTable("document_sequences", {
  key: text("key").primaryKey(),
  nextValue: integer("next_value").notNull().default(1),
});

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"),
  expiresAt: text("expires_at").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
});
