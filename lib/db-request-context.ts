import { AsyncLocalStorage } from "node:async_hooks";

type DbRequestStore = {
  userId?: string;
};

const storage = new AsyncLocalStorage<DbRequestStore>();

export function getDbRequestUserId() {
  return storage.getStore()?.userId ?? "";
}

export function runWithDbUser<T>(userId: string, run: () => Promise<T> | T) {
  return storage.run({ userId }, run);
}

export function isRlsEnforceEnabled() {
  return process.env.WAZEN_RLS_ENFORCE?.trim() === "1";
}
