/**
 * Unit tests for the in-memory rate limiter (src/lib/rate-limit.ts).
 *
 * Run with: bun test
 */
import { afterEach, describe, expect, it } from "bun:test";
import { clientIp, rateLimit, sweepRateLimits } from "./rate-limit";

// Each test uses a fresh key so windows do not leak between tests.
let seq = 0;
function key() {
  seq += 1;
  return `test:${seq}`;
}

afterEach(() => {
  sweepRateLimits();
});

describe("rateLimit (fixed window)", () => {
  it("allows requests up to the limit and blocks the next one", () => {
    const k = key();
    const limit = 3;
    for (let i = 0; i < limit; i++) {
      const r = rateLimit(k, limit, 60_000);
      expect(r.ok).toBe(true);
    }
    const blocked = rateLimit(k, limit, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetInSec).toBeGreaterThan(0);
    expect(blocked.resetInSec).toBeLessThanOrEqual(60);
  });

  it("counts down remaining as requests are consumed", () => {
    const k = key();
    expect(rateLimit(k, 5, 60_000).remaining).toBe(4);
    expect(rateLimit(k, 5, 60_000).remaining).toBe(3);
    expect(rateLimit(k, 5, 60_000).remaining).toBe(2);
  });

  it("resets after the window elapses (simulated clock)", () => {
    const k = key();
    const t0 = 1_000_000;
    rateLimit(k, 1, 1_000, t0);
    expect(rateLimit(k, 1, 1_000, t0 + 500).ok).toBe(false); // still inside
    expect(rateLimit(k, 1, 1_000, t0 + 1_000).ok).toBe(true); // window expired
  });

  it("tracks independent buckets independently", () => {
    const a = key();
    const b = key();
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });

  it("rejects a zero limit outright", () => {
    expect(rateLimit(key(), 0, 60_000).ok).toBe(false);
  });

  it("sweep removes only expired windows", () => {
    const t0 = 5_000_000;
    const fresh = key();
    const stale = key();
    rateLimit(fresh, 5, 60_000, t0);
    rateLimit(stale, 5, 60_000, t0 - 120_000);
    expect(sweepRateLimits(t0)).toBeGreaterThanOrEqual(1);
    // The fresh bucket still enforces its count.
    expect(rateLimit(fresh, 5, 60_000, t0 + 1).remaining).toBe(3);
  });
});

describe("clientIp", () => {
  it("extracts the first IP from x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip and then 'local'", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(new Headers())).toBe("local");
  });
});
