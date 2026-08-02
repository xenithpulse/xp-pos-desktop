// lib/concurrency.ts
// Concurrency-safety utilities for backend API routes.
// Provides helpers for version-conflict detection and retry logic.

import { Error as MongooseError } from 'mongoose';

/** Name of the Mongoose VersionError class */
const VERSION_ERROR_NAME = 'VersionError';

/**
 * Check whether an error is a Mongoose VersionError (optimistic locking conflict).
 * This happens when `optimisticConcurrency: true` is set on a schema and
 * another process modified the document between find and save.
 */
export function isVersionConflict(err: unknown): boolean {
  if (err instanceof MongooseError && err.name === VERSION_ERROR_NAME) return true;
  // Also catch MongoDB duplicate-key error (code 11000) on version fields
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    if (e.name === VERSION_ERROR_NAME) return true;
    // MongoDB write conflict in transactions
    if (e.code === 112 || e.codeName === 'WriteConflict') return true;
  }
  return false;
}

/**
 * Standard HTTP 409 Conflict response body for version conflicts.
 * The client can use `retryable: true` to decide whether to auto-retry.
 */
export function versionConflictBody(entity: string) {
  return {
    error: `${entity} was modified by another user. Please refresh and try again.`,
    code: 'VERSION_CONFLICT',
    retryable: true,
  };
}

/**
 * Retry a database operation up to `maxRetries` times on version conflict.
 * Useful for simple idempotent operations where automatic retry is safe.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isVersionConflict(err) || attempt === maxRetries) throw err;
      // Small jitter before retry to reduce collision probability
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  }
  throw lastError;
}
