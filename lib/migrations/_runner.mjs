#!/usr/bin/env node
// scripts/migrations/_runner.mjs
//
// Versioned migration runner for tenant DBs.
//
// Usage:
//   node --env-file=.env.local scripts/migrations/_runner.mjs status
//   node --env-file=.env.local scripts/migrations/_runner.mjs up
//   node --env-file=.env.local scripts/migrations/_runner.mjs up --to 0003
//   node --env-file=.env.local scripts/migrations/_runner.mjs --tenant chateau up
//
// Migration files in this folder must be named:
//   NNNN-some-description.mjs
// and export:
//   export const id = "0001";
//   export const description = "...";
//   export async function up(conn) { ... }   // required
//   export async function down(conn) { ... } // optional, for rollback
//
// State is tracked in the per-tenant `_migrations` collection:
//   { _id: "0001", description, appliedAt, durationMs }

import mongoose from "mongoose";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_COLL = "_migrations";

function parseArgs(argv) {
  const args = { command: null, to: null, tenant: null, dryRun: false };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--to") args.to = rest[++i];
    else if (a === "--tenant") args.tenant = rest[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (!args.command) args.command = a;
  }
  return args;
}

async function loadMigrations() {
  const files = (await readdir(__dirname))
    .filter((f) => /^\d{4}-.+\.mjs$/.test(f))
    .sort();
  const mods = [];
  for (const file of files) {
    const url = pathToFileURL(join(__dirname, file)).href;
    const mod = await import(url);
    if (!mod.id || !mod.up) {
      throw new Error(`Migration ${file} missing required exports (id, up)`);
    }
    mods.push({ file, ...mod });
  }
  return mods;
}

async function getApplied(conn) {
  const docs = await conn.db.collection(MIGRATIONS_COLL).find({}).toArray();
  return new Set(docs.map((d) => d._id));
}

async function recordApplied(conn, mig, durationMs) {
  await conn.db.collection(MIGRATIONS_COLL).insertOne({
    _id: mig.id,
    description: mig.description ?? "",
    appliedAt: new Date(),
    durationMs,
  });
}

async function connectToTenant(tenantDb) {
  const baseUri = process.env.MONGODB_URI;
  if (!baseUri) throw new Error("MONGODB_URI missing");
  if (!tenantDb) throw new Error("TENANT_DB missing");
  const cluster = await mongoose
    .createConnection(baseUri, { serverSelectionTimeoutMS: 30_000 })
    .asPromise();
  return { cluster, tenantConn: cluster.useDb(tenantDb, { useCache: true }) };
}

async function runStatus(conn, migrations) {
  const applied = await getApplied(conn);
  console.log(`\nTenant DB: ${conn.name}`);
  console.log("─".repeat(60));
  for (const m of migrations) {
    const mark = applied.has(m.id) ? "✔" : "·";
    console.log(`  ${mark}  ${m.id}  ${m.description ?? m.file}`);
  }
  const pending = migrations.filter((m) => !applied.has(m.id));
  console.log(`\n${pending.length} pending, ${applied.size} applied.\n`);
}

async function runUp(conn, migrations, opts) {
  const applied = await getApplied(conn);
  const pending = migrations.filter((m) => !applied.has(m.id));
  const target = opts.to
    ? pending.filter((m) => m.id <= opts.to)
    : pending;

  if (target.length === 0) {
    console.log(`Nothing to apply for ${conn.name}.`);
    return;
  }

  console.log(`\nApplying ${target.length} migration(s) to ${conn.name}...`);
  for (const m of target) {
    process.stdout.write(`  → ${m.id} ${m.description ?? m.file} ... `);
    if (opts.dryRun) {
      console.log("(dry-run, skipped)");
      continue;
    }
    const t0 = Date.now();
    try {
      await m.up(conn);
      const dt = Date.now() - t0;
      await recordApplied(conn, m, dt);
      console.log(`done in ${dt}ms`);
    } catch (err) {
      console.log("FAILED");
      console.error(err);
      throw err;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.command) {
    console.error("Usage: _runner.mjs <status|up> [--to NNNN] [--tenant NAME] [--dry-run]");
    process.exit(2);
  }

  const tenantDb = args.tenant ?? process.env.TENANT_DB;
  if (!tenantDb) {
    console.error("No tenant specified. Pass --tenant NAME or set TENANT_DB.");
    process.exit(2);
  }

  const migrations = await loadMigrations();
  const { cluster, tenantConn } = await connectToTenant(tenantDb);
  try {
    if (args.command === "status") {
      await runStatus(tenantConn, migrations);
    } else if (args.command === "up") {
      await runUp(tenantConn, migrations, args);
    } else {
      console.error(`Unknown command: ${args.command}`);
      process.exit(2);
    }
  } finally {
    await cluster.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
