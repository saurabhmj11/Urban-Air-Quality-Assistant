/**
 * In-memory fixed-window rate limiter.
 *
 * Protects the GenAI endpoints from accidental loops and deliberate abuse
 * (each AI call has a real cost). Keyed by client IP + bucket name.
 * For a single-instance deployment this is sufficient; a multi-instance
 * deployment would swap the Map for Redis.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Requests still allowed inside the current window. */
  remaining: number;
  /** Seconds until the window resets. */
  resetInSec: number;
}

interface Window {
  count: number;
  resetAt: number;
}

// Stored on globalThis so hot reloads in dev do not wipe the counters.
const globalForRL = globalThis as unknown as {
  breatheasyRateBuckets?: Map<string, Window>;
};
const buckets: Map<string, Window> =
  globalForRL.breatheasyRateBuckets ?? new Map<string, Window>();
globalForRL.breatheasyRateBuckets = buckets;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  nowMs: number = Date.now()
): RateLimitResult {
  if (limit <= 0) {
    return { ok: false, remaining: 0, resetInSec: 0 };
  }
  const entry = buckets.get(key);
  if (!entry || nowMs >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return {
      ok: true,
      remaining: limit - 1,
      resetInSec: Math.ceil(windowMs / 1000),
    };
  }
  if (entry.count < limit) {
    entry.count += 1;
    return {
      ok: true,
      remaining: limit - entry.count,
      resetInSec: Math.ceil((entry.resetAt - nowMs) / 1000),
    };
  }
  return {
    ok: false,
    remaining: 0,
    resetInSec: Math.ceil((entry.resetAt - nowMs) / 1000),
  };
}

/**
 * Drop expired windows. Exported for tests; also safe to call periodically
 * from a route handler so the Map cannot grow unbounded.
 */
export function sweepRateLimits(nowMs: number = Date.now()): number {
  let removed = 0;
  for (const [key, entry] of buckets) {
    if (nowMs >= entry.resetAt) {
      buckets.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/** Best-effort client IP extraction from proxy headers. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "local";
}
