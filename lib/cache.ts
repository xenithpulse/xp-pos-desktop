// lib/cache.ts
// Hardened Map-based cache with TTL, max-size eviction, and version-aware invalidation.
// Used across OrderEditor, OrderList, and any component needing order/entity caching.

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  /** Optional version key (e.g. updatedAt timestamp) for staleness detection */
  version?: string;
}

export interface SmartCacheOptions {
  /** Maximum age in ms before entry is considered stale (default: 30s) */
  ttl?: number;
  /** Maximum number of entries before oldest is evicted (default: 200) */
  maxSize?: number;
}

const DEFAULT_TTL = 30_000;
const DEFAULT_MAX_SIZE = 200;

export class SmartCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = []; // tracks insertion order for LRU eviction
  private readonly ttl: number;
  private readonly maxSize: number;

  constructor(options?: SmartCacheOptions) {
    this.ttl = options?.ttl ?? DEFAULT_TTL;
    this.maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;
  }

  /** Get a cached entry if it exists and is not stale */
  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > this.ttl) {
      // Stale — remove and return null
      this.delete(key);
      return null;
    }
    // Move to end of access order (most recently used)
    this.touchAccessOrder(key);
    return entry.data;
  }

  /** Get a cached entry only if version matches (avoids returning stale data after mutation) */
  getIfVersion(key: string, version: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > this.ttl) {
      this.delete(key);
      return null;
    }
    if (entry.version && entry.version !== version) {
      // Version mismatch — data is stale from a concurrent mutation
      this.delete(key);
      return null;
    }
    this.touchAccessOrder(key);
    return entry.data;
  }

  /** Set a cache entry, evicting oldest if at capacity */
  set(key: string, data: T, version?: string): void {
    // Evict oldest entries if we're at capacity
    while (this.store.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift()!;
      this.store.delete(oldest);
    }

    this.store.set(key, {
      data,
      fetchedAt: Date.now(),
      version,
    });
    this.touchAccessOrder(key);
  }

  /** Invalidate (remove) a specific key */
  delete(key: string): void {
    this.store.delete(key);
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
  }

  /** Invalidate all entries matching a predicate */
  invalidateWhere(predicate: (key: string, entry: CacheEntry<T>) => boolean): void {
    for (const [key, entry] of this.store.entries()) {
      if (predicate(key, entry)) {
        this.store.delete(key);
      }
    }
    this.accessOrder = this.accessOrder.filter((k) => this.store.has(k));
  }

  /** Clear the entire cache */
  clear(): void {
    this.store.clear();
    this.accessOrder = [];
  }

  /** Number of entries currently cached */
  get size(): number {
    return this.store.size;
  }

  /** Check if a key exists and is not stale */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  private touchAccessOrder(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(key);
  }
}
