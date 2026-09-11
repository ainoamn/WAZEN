import assert from "node:assert/strict";
import test from "node:test";
import {
  canQueueOffline,
  clearOfflineQueue,
  enqueueOfflineRequest,
  flushOfflineQueue,
  readOfflineQueue,
} from "../lib/offline-queue.ts";

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

test("offline queue accepts dashboard writes and rejects auth or GET", () => {
  assert.equal(canQueueOffline("/api/dashboard", "POST"), true);
  assert.equal(canQueueOffline("/api/v1/spaces", "POST"), true);
  assert.equal(canQueueOffline("/api/dashboard", "GET"), false);
  assert.equal(canQueueOffline("/api/auth", "POST"), false);
  assert.equal(canQueueOffline("/api/platform?view=billing", "POST"), false);
});

test("offline queue stores a write and replays it when the network returns", async () => {
  const storage = memoryStorage();
  clearOfflineQueue(storage);
  enqueueOfflineRequest({
    url: "/api/dashboard",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "addTransaction", amount: "1" }),
  }, storage);
  assert.equal(readOfflineQueue(storage).length, 1);

  const sent = [];
  const result = await flushOfflineQueue(async (url, init) => {
    sent.push({ url, method: init.method, body: init.body });
    return new Response("{}", { status: 200 });
  }, storage);
  assert.equal(result.sent, 1);
  assert.equal(result.remaining, 0);
  assert.equal(sent[0].url, "/api/dashboard");
  assert.equal(readOfflineQueue(storage).length, 0);
});

test("offline flush keeps the queue when the server is unauthorized", async () => {
  const storage = memoryStorage();
  enqueueOfflineRequest({
    url: "/api/dashboard",
    method: "POST",
    body: "{}",
  }, storage);
  const result = await flushOfflineQueue(async () => new Response("no", { status: 401 }), storage);
  assert.equal(result.sent, 0);
  assert.equal(result.remaining, 1);
});
