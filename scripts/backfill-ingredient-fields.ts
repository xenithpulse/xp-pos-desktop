import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mongoose from 'mongoose';

async function backfill() {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI!).asPromise();
  const db = conn.useDb(process.env.TENANT_DB!);

  const result = await db.collection('ingredients').updateMany(
    { lowStockThreshold: { $exists: false } },
    { $set: { lowStockThreshold: 10 } }
  );
  console.log('Set lowStockThreshold for', result.modifiedCount, 'ingredients');

  const result2 = await db.collection('ingredients').updateMany(
    { totalConsumed: { $exists: false } },
    { $set: { totalConsumed: 0, totalRestocked: 0, deltas: [] } }
  );
  console.log('Backfilled stats fields for', result2.modifiedCount, 'ingredients');

  await conn.close();
  process.exit(0);
}

backfill().catch((e) => { console.error(e); process.exit(1); });
