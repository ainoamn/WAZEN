import { ensureSchema, getRawDb, getRequestUser } from "../../../db/runtime";

type SpaceRow = {
  id: string;
  owner_user_id: string;
  name_ar: string;
  name_en: string;
  type: string;
  currency: string;
  balance_minor: number;
  goal_minor: number;
  accent: string;
  created_at: string;
};

type MemberRow = {
  id: string;
  space_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  role: string;
  status: string;
  due_minor: number;
  paid_minor: number;
  extra_minor: number;
  avatar: string;
  joined_at: string;
};

type TransactionRow = {
  id: string;
  space_id: string;
  user_id: string;
  member_id: string | null;
  kind: string;
  allocation: string;
  amount_minor: number;
  description_ar: string;
  description_en: string;
  status: string;
  occurred_at: string;
  created_at: string;
};

const now = () => new Date().toISOString();

function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

async function seedUser(db: D1Database, user: NonNullable<ReturnType<typeof getRequestUser>>) {
  const createdAt = now();
  await db
    .prepare(`INSERT INTO users (id, email, display_name, locale, currency, created_at)
      VALUES (?, ?, ?, 'ar', 'SAR', ?)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name`)
    .bind(user.id, user.email, user.displayName, createdAt)
    .run();

  const existing = await db
    .prepare("SELECT COUNT(*) AS count FROM spaces WHERE owner_user_id = ?")
    .bind(user.id)
    .first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;

  const prefix = cleanId(user.id);
  const personal = `${prefix}-personal`;
  const household = `${prefix}-household`;
  const trip = `${prefix}-trip`;
  const society = `${prefix}-society`;

  await db.batch([
    db.prepare("INSERT INTO spaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      personal, user.id, "محفظتي الشخصية", "Personal wallet", "personal", "SAR", 842000, 1500000, "navy", createdAt,
    ),
    db.prepare("INSERT INTO spaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      household, user.id, "ميزانية المنزل", "Home budget", "household", "SAR", 124700, 300000, "amber", createdAt,
    ),
    db.prepare("INSERT INTO spaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      trip, user.id, "رحلة العائلة 2027", "Family trip 2027", "trip", "SAR", 386000, 1200000, "emerald", createdAt,
    ),
    db.prepare("INSERT INTO spaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      society, user.id, "جمعية الإخوة", "Siblings circle", "society", "SAR", 210000, 1200000, "purple", createdAt,
    ),
    db.prepare("INSERT INTO contribution_plans VALUES (?, ?, ?, 'monthly', 1, 'personal_reserve', ?)").bind(`${trip}-plan`, trip, 2000, createdAt),
    db.prepare("INSERT INTO contribution_plans VALUES (?, ?, ?, 'monthly', 5, 'personal_reserve', ?)").bind(`${society}-plan`, society, 20000, createdAt),
  ]);

  const people = [
    ["ahmad", "أحمد محمد", user.email, "owner", 2000, 2000, 2000, "#0f766e"],
    ["khalid", "خالد محمد", "khalid@example.com", "treasurer", 2000, 2000, 0, "#2563eb"],
    ["fatima", "فاطمة محمد", "fatima@example.com", "member", 2000, 2000, 3000, "#c2410c"],
    ["sara", "سارة محمد", "sara@example.com", "member", 2000, 0, 0, "#7c3aed"],
    ["omar", "عمر محمد", "omar@example.com", "member", 2000, 2000, 1400, "#0891b2"],
  ] as const;
  await db.batch(
    people.map((person) =>
      db.prepare("INSERT INTO members VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)").bind(
        `${trip}-${person[0]}`,
        trip,
        person[0] === "ahmad" ? user.id : null,
        person[1],
        person[2],
        person[3],
        person[4],
        person[5],
        person[6],
        person[7],
        createdAt,
      ),
    ),
  );

  const transactionSeeds = [
    [personal, "income", "general", 720000, "راتب شهر أغسطس", "August salary", "2026-08-01T08:00:00.000Z"],
    [personal, "expense", "general", 26800, "مشتريات المنزل", "Home groceries", "2026-08-10T17:20:00.000Z"],
    [personal, "expense", "general", 12000, "وقود السيارة", "Car fuel", "2026-08-09T12:15:00.000Z"],
    [household, "expense", "general", 34000, "فاتورة الكهرباء", "Electricity bill", "2026-08-08T10:00:00.000Z"],
    [trip, "contribution", "mandatory", 2000, "مساهمة أحمد الشهرية", "Ahmad monthly contribution", "2026-08-07T09:30:00.000Z"],
    [trip, "contribution", "personal_reserve", 3000, "فائض شخصي لفاطمة", "Fatima personal reserve", "2026-08-07T09:35:00.000Z"],
    [society, "contribution", "mandatory", 20000, "دفعة الجمعية الشهرية", "Monthly circle payment", "2026-08-05T11:00:00.000Z"],
    [trip, "reimbursement", "general", 60000, "حجز دفعه خالد من ماله", "Booking paid by Khalid", "2026-08-03T14:00:00.000Z"],
  ] as const;

  await db.batch(
    transactionSeeds.map((item, index) =>
      db.prepare("INSERT INTO transactions VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'approved', ?, ?)").bind(
        `${prefix}-tx-${index + 1}`,
        item[0],
        user.id,
        item[1],
        item[2],
        item[3],
        item[4],
        item[5],
        item[6],
        createdAt,
      ),
    ),
  );
}

async function loadDashboard(db: D1Database, userId: string) {
  const spaces = await db
    .prepare("SELECT * FROM spaces WHERE owner_user_id = ? ORDER BY created_at ASC")
    .bind(userId)
    .all<SpaceRow>();
  const ids = spaces.results.map((space) => space.id);
  if (!ids.length) return { spaces: [], members: [], transactions: [], plans: [] };

  const placeholders = ids.map(() => "?").join(",");
  const members = await db
    .prepare(`SELECT * FROM members WHERE space_id IN (${placeholders}) ORDER BY joined_at ASC`)
    .bind(...ids)
    .all<MemberRow>();
  const transactions = await db
    .prepare(`SELECT * FROM transactions WHERE space_id IN (${placeholders}) ORDER BY occurred_at DESC LIMIT 80`)
    .bind(...ids)
    .all<TransactionRow>();
  const plans = await db
    .prepare(`SELECT * FROM contribution_plans WHERE space_id IN (${placeholders})`)
    .bind(...ids)
    .all();

  return {
    spaces: spaces.results,
    members: members.results,
    transactions: transactions.results,
    plans: plans.results,
  };
}

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const db = getRawDb();
    await ensureSchema(db);
    await seedUser(db, user);
    const dashboard = await loadDashboard(db, user.id);
    return Response.json({ user, ...dashboard });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load dashboard" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

  try {
    const db = getRawDb();
    await ensureSchema(db);
    await seedUser(db, user);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "addWallet") {
      const name = String(payload.name ?? "").trim();
      const type = String(payload.type ?? "personal");
      const allowedTypes = ["personal", "household", "trip", "society", "group"];
      if (!name || !allowedTypes.includes(type)) {
        return Response.json({ error: "Invalid wallet" }, { status: 400 });
      }
      const id = `${cleanId(user.id)}-${crypto.randomUUID()}`;
      const goalMinor = Math.max(0, Math.round(Number(payload.goal ?? 0) * 100));
      await db.prepare("INSERT INTO spaces VALUES (?, ?, ?, ?, ?, 'SAR', 0, ?, 'emerald', ?)")
        .bind(id, user.id, name, name, type, goalMinor, now())
        .run();
    } else if (action === "addTransaction") {
      const spaceId = String(payload.spaceId ?? "");
      const kind = String(payload.kind ?? "expense");
      const allocation = String(payload.allocation ?? "general");
      const description = String(payload.description ?? "").trim();
      const amountMinor = Math.round(Number(payload.amount ?? 0) * 100);
      const memberId = payload.memberId ? String(payload.memberId) : null;
      if (!spaceId || !description || !Number.isFinite(amountMinor) || amountMinor <= 0) {
        return Response.json({ error: "Invalid transaction" }, { status: 400 });
      }
      const space = await db.prepare("SELECT id FROM spaces WHERE id = ? AND owner_user_id = ?")
        .bind(spaceId, user.id).first();
      if (!space) return Response.json({ error: "Wallet not found" }, { status: 404 });

      const positiveKinds = ["income", "contribution"];
      const balanceDelta = allocation === "personal_reserve"
        ? 0
        : (positiveKinds.includes(kind) ? amountMinor : -amountMinor);
      const transactionId = crypto.randomUUID();
      const occurredAt = String(payload.occurredAt ?? now());
      const statements = [
        db.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
          .bind(transactionId, spaceId, user.id, memberId, kind, allocation, amountMinor, description, description, occurredAt, now()),
        db.prepare("UPDATE spaces SET balance_minor = MAX(0, balance_minor + ?) WHERE id = ?")
          .bind(balanceDelta, spaceId),
      ];
      if (memberId && allocation === "personal_reserve") {
        statements.push(db.prepare("UPDATE members SET extra_minor = extra_minor + ? WHERE id = ? AND space_id = ?")
          .bind(amountMinor, memberId, spaceId));
      } else if (memberId && kind === "contribution") {
        statements.push(db.prepare("UPDATE members SET paid_minor = paid_minor + ? WHERE id = ? AND space_id = ?")
          .bind(amountMinor, memberId, spaceId));
      }
      await db.batch(statements);
    } else {
      return Response.json({ error: "Unsupported action" }, { status: 400 });
    }

    return Response.json({ ok: true, ...(await loadDashboard(db, user.id)) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to save" },
      { status: 500 },
    );
  }
}
