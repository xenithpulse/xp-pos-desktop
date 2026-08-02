// models/factories/Counter.ts
// Atomic counter factory for generating guaranteed-unique sequence numbers.

import { Connection, Model } from 'mongoose';
import { CounterSchema, ICounter } from '../schemas/counter.schema';

export function CounterModel(conn: Connection): Model<ICounter> {
  return (
    conn.models.Counter ||
    conn.model<ICounter>('Counter', CounterSchema)
  );
}

// Process-level set tracking which counters have been synced this boot.
// Avoids running the expensive seed query on every single call.
const syncedCounters = new Set<string>();

/**
 * Atomically increment a named counter and return the new value.
 * Uses `findOneAndUpdate` with `upsert: true` — guaranteed atomic by MongoDB.
 * No two concurrent calls can ever receive the same number.
 *
 * If `seedFn` is provided, the counter is synced to at least the seed value
 * once per process lifetime (using `$max`).  This ensures the counter always
 * catches up to reality — even if orphaned documents (from non-transactional
 * rollbacks on standalone MongoDB) have advanced past the counter.
 */
export async function nextSequence(
  conn: Connection,
  counterName: string,
  seedFn?: () => Promise<number>,
): Promise<number> {
  const Counter = CounterModel(conn);

  // Sync once per counter per process lifetime.
  if (seedFn && !syncedCounters.has(counterName)) {
    const seedValue = await seedFn();
    if (seedValue > 0) {
      // $max ensures the counter is bumped up if the DB has documents
      // beyond its current value (e.g. orphans from aborted txns).
      await Counter.updateOne(
        { _id: counterName },
        { $max: { seq: seedValue } },
        { upsert: true },
      );
    } else {
      // First time, no existing docs — just ensure the doc exists.
      await Counter.updateOne(
        { _id: counterName },
        { $setOnInsert: { seq: 0 } },
        { upsert: true },
      );
    }
    syncedCounters.add(counterName);
  }

  const result = await Counter.findOneAndUpdate(
    { _id: counterName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  return result!.seq;
}

/**
 * Force a re-sync of a specific counter on the next `nextSequence` call.
 * Call this when you know the counter may be stale (e.g. after an orphan
 * cleanup or after detecting a duplicate key error).
 */
export function invalidateCounterCache(counterName: string): void {
  syncedCounters.delete(counterName);
}
