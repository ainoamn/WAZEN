#!/usr/bin/env node
/**
 * Dual build entry:
 * - Vercel / standard Next host → `next build`
 * - Cloudflare vinext Sites → `vinext build`
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const isVercel =
  process.env.VERCEL === "1" ||
  process.env.DEPLOY_TARGET === "vercel" ||
  process.env.NEXT_PUBLIC_DEPLOY_TARGET === "vercel";

function resolveBin(pkg, binName) {
  const pkgJson = require.resolve(`${pkg}/package.json`, { paths: [root] });
  const pkgDir = path.dirname(pkgJson);
  const meta = require(pkgJson);
  const binField = meta.bin;
  const relative =
    typeof binField === "string" ? binField : binField?.[binName ?? pkg];
  if (!relative) {
    throw new Error(`Binary not found for package ${pkg}`);
  }
  return path.join(pkgDir, relative);
}

const command = isVercel
  ? resolveBin("next", "next")
  : resolveBin("vinext", "vinext");

console.log(
  isVercel
    ? "Detected Vercel. Running next build..."
    : "Running vinext build (Cloudflare Sites)..."
);

const env = {
  ...process.env,
  // Prefer Node SQLite for API routes when building with Next.js.
  ...(isVercel ? { WAZEN_USE_NODE_SQLITE: "1" } : {}),
};

const result = spawnSync(process.execPath, [command, "build"], {
  stdio: "inherit",
  cwd: root,
  env,
});

process.exit(result.status ?? 1);
