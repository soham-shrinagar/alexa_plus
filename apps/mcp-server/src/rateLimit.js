/** Fixed windows with bounded memory. Refuse new keys at capacity; never evict a live limit. */
export class RequestBudget {
  constructor({ limit, windowMs, maxKeys = 10000, now = Date.now }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.now = now;
    this.buckets = new Map();
  }

  take(key) {
    const now = this.now();
    // Entries retain window-start insertion order, so only the expired prefix needs scanning.
    for (const [id, bucket] of this.buckets) {
      if (now - bucket.started < this.windowMs) break;
      this.buckets.delete(id);
    }
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) return false;
      bucket = { started: now, count: 0 };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= this.limit) return false;
    bucket.count++;
    return true;
  }
}
