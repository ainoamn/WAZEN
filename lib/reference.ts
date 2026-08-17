export async function nextReference(db: D1Database, namespace: string, prefix: string, date = new Date()) {
  const year = date.getUTCFullYear(); const key = `${namespace}-${year}`;
  const row = await db.prepare(`INSERT INTO document_sequences ("key",next_value) VALUES (?,1)
    ON CONFLICT("key") DO UPDATE SET next_value=document_sequences.next_value+1 RETURNING next_value`).bind(key).first<{ next_value: number }>();
  if (!row || !Number.isSafeInteger(Number(row.next_value))) throw new Error("REFERENCE_SEQUENCE_FAILED");
  return `WZN-${prefix}-${year}-${String(row.next_value).padStart(8, "0")}`;
}

