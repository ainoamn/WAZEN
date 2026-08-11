import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getRawDb } from "./runtime";

export function getDb() {
  return drizzle(getRawDb(), { schema });
}
