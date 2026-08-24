import { AsyncLocalStorage } from "node:async_hooks";

type DbRequestStore = {
  userId?: string;
  rlsWarned?: boolean;
};

const storage = new AsyncLocalStorage<DbRequestStore>();

export function getDbRequestUserId() {
  return storage.getStore()?.userId ?? "";
}

export function markRlsMissingUserWarned() {
  const store = storage.getStore();
  // Outside runWithDbUser (jobs/schema): skip warnings to avoid log floods.
  if (!store) return true;
  if (store.rlsWarned) return true;
  store.rlsWarned = true;
  return false;
}

export function runWithDbUser<T>(userId: string, run: () => Promise<T> | T) {
  return storage.run({ userId }, run);
}

export function isRlsEnforceEnabled() {
  return process.env.WAZEN_RLS_ENFORCE?.trim() === "1";
}

/** Staging helper: document intent to flip enforce after verifying user-scoped routes. */
export function isRlsDryRunEnabled() {
  return process.env.WAZEN_RLS_DRY_RUN?.trim() === "1";
}
