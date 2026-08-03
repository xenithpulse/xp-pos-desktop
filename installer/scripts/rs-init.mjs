// installer/scripts/rs-init.mjs
// One-time replica-set initiation for the XP POS appliance database.
//
// Run by provision.ps1 with the BUNDLED node.exe, after XPPOS-MongoDB is up but
// BEFORE XPPOS-App starts:
//
//     node.exe rs-init.mjs "C:\Program Files\XP POS\app\node_modules"
//
// ── Why this exists ─────────────────────────────────────────────────────────
// The app uses multi-document transactions (fire-order, order edits, table
// sessions, cash slips) and MongoDB refuses those on a standalone mongod. A
// single-node replica set is the minimum that supports them. Under Docker the
// compose healthcheck did this with mongosh; natively we use the mongodb driver
// that is already inside the app bundle, so the installer needs no mongosh.
//
// ── Two things that make this harder than a one-liner ───────────────────────
//  1. It must be idempotent. Re-running the installer is a supported upgrade,
//     and replSetInitiate throws AlreadyInitialized the second time.
//  2. replSetInitiate RETURNS BEFORE THE NODE IS PRIMARY. Starting the app
//     immediately after it returns is a race: the first writes hit a server
//     that is still SECONDARY and fail. We poll hello.isWritablePrimary.

import { createRequire } from 'node:module';
import path from 'node:path';

// The driver lives in the app bundle, not next to this script, so resolve it
// from the path provision.ps1 passes in.
const nodeModulesDir = process.argv[2];
if (!nodeModulesDir) {
  console.error('usage: node rs-init.mjs <path-to-app-node_modules>');
  process.exit(2);
}

const require = createRequire(path.join(nodeModulesDir, 'index.js'));
let MongoClient;
try {
  ({ MongoClient } = require('mongodb'));
} catch (err) {
  console.error(`FATAL: could not load the mongodb driver from ${nodeModulesDir}`);
  console.error('       The application bundle is incomplete - reinstall the POS.');
  console.error(`       ${err.message}`);
  process.exit(3);
}

const HOST = '127.0.0.1:27017';
const RS_NAME = 'rs0';
// Generous: a cold first start on slow disk can take a while to accept
// connections, and this runs immediately after the service reports "started".
const CONNECT_TIMEOUT_MS = 60_000;
const PRIMARY_TIMEOUT_MS = 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // directConnection: we are talking to a node that may not be a replica set
  // member yet, so normal topology discovery would not find a primary.
  const client = new MongoClient(`mongodb://${HOST}/?directConnection=true`, {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
  });

  await client.connect();
  const admin = client.db('admin');

  let initiated = false;
  try {
    await admin.command({
      replSetInitiate: {
        _id: RS_NAME,
        // Loopback only. See mongod.cfg - this database has no auth, and the
        // 127.0.0.1 bind is the single control keeping it off the LAN.
        members: [{ _id: 0, host: HOST }],
      },
    });
    initiated = true;
    console.log(`replica set ${RS_NAME} initiated`);
  } catch (err) {
    // AlreadyInitialized (code 23) is the expected re-run case and is a
    // success, not a failure. Anything else is real.
    if (err.codeName === 'AlreadyInitialized' || err.code === 23) {
      console.log(`replica set ${RS_NAME} already initialised - nothing to do`);
    } else {
      console.error(`FATAL: replSetInitiate failed: ${err.codeName ?? ''} ${err.message}`);
      await client.close();
      process.exit(4);
    }
  }

  // Wait for an actual PRIMARY before letting the app start.
  const deadline = Date.now() + PRIMARY_TIMEOUT_MS;
  let primary = false;
  while (Date.now() < deadline) {
    try {
      const hello = await admin.command({ hello: 1 });
      if (hello.isWritablePrimary) { primary = true; break; }
    } catch {
      // mongod steps through states during election; transient errors here are
      // normal and not worth reporting.
    }
    await sleep(1000);
  }

  await client.close();

  if (!primary) {
    console.error('FATAL: node did not reach PRIMARY within 60s.');
    console.error('       Check C:\\ProgramData\\XP POS\\logs\\mongodb for the reason.');
    process.exit(5);
  }

  console.log(`database is PRIMARY and ready${initiated ? ' (first-time setup)' : ''}`);
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  // ECONNREFUSED here almost always means mongod died on startup. The most
  // common cause on low-end hardware is a CPU with no AVX support, which kills
  // MongoDB 5.0+ with "Illegal instruction" - point the technician at the log.
  console.error('       Check C:\\ProgramData\\XP POS\\logs\\mongodb for the reason.');
  process.exit(1);
});
