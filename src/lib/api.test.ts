/**
 * Tests for the shared route guard (src/lib/api.ts).
 *
 * The guard is the plumbing every JSON POST route now depends on, so its
 * contract deserves direct coverage: happy path, 429 with Retry-After,
 * invalid JSON, schema rejection and the routeError envelope.
 */
import { describe, expect, it } from "bun:test";
import type { NextResponse } from "next/server";
import { guardRoute, routeError, type GuardableRequest } from "@/lib/api";
import { chatRequestSchema, commuteRequestSchema } from "@/lib/validation";

/** Unique IP per test so in-memory rate-limit buckets never leak across tests. */
let ipSeq = 0;
const nextIp = () => `10.0.${Math.floor(ipSeq / 256) % 256}.${(ipSeq += 1) % 256}`;

function fakeRequest(body: unknown, ip = nextIp()): GuardableRequest {
  return {
    headers: new Headers({ "x-forwarded-for": ip }),
    json: () =>
      body instanceof Error ? Promise.reject(body) : Promise.resolve(body),
  };
}

const opts = (over: Partial<Parameters<typeof guardRoute>[1]> = {}) => ({
  key: "test",
  limit: 3,
  windowMs: 5 * 60 * 1000,
  rateMessage: "Too many requests",
  schema: chatRequestSchema,
  ...over,
});

describe("guardRoute", () => {
  it("passes the schema-typed body through on success", async () => {
    const body = { city: "delhi", messages: [{ role: "user", content: "hi" }] };
    const guard = await guardRoute(fakeRequest(body), opts());
    expect(guard.ok).toBeTrue();
    if (guard.ok) {
      expect(guard.value).toEqual(body);
    }
  });

  it("rejects a body that fails the zod schema with 400", async () => {
    const guard = await guardRoute(
      fakeRequest({ city: "london", messages: [] }),
      opts()
    );
    expect(guard.ok).toBeFalse();
    if (!guard.ok) {
      expect(guard.response.status).toBe(400);
      const payload = (await guard.response.json()) as { error: string };
      expect(payload.error).toStartWith("Invalid request");
    }
  });

  it("rejects invalid JSON with 400 and a stable message", async () => {
    const guard = await guardRoute(
      fakeRequest(new Error("unexpected end of JSON input")),
      opts()
    );
    expect(guard.ok).toBeFalse();
    if (!guard.ok) {
      expect(guard.response.status).toBe(400);
      const payload = (await guard.response.json()) as { error: string };
      expect(payload.error).toBe("Invalid JSON body");
    }
  });

  it("returns 429 with Retry-After once the limit is exhausted", async () => {
    const ip = nextIp();
    const sameIp = () => fakeRequest({ city: "delhi", messages: [{ role: "user", content: "hi" }] }, ip);
    const o = opts({ limit: 2 });

    expect((await guardRoute(sameIp(), o)).ok).toBeTrue();
    expect((await guardRoute(sameIp(), o)).ok).toBeTrue();
    const blocked = await guardRoute(sameIp(), o);

    expect(blocked.ok).toBeFalse();
    if (!blocked.ok) {
      expect(blocked.response.status).toBe(429);
      expect(blocked.response.headers.get("Retry-After")).toStartWith("3");
      const payload = (await blocked.response.json()) as { error: string };
      expect(payload.error).toStartWith("Too many requests — try again in");
    }
  });

  it("rate-limits per IP, not globally", async () => {
    const o = opts({ limit: 1 });
    expect((await guardRoute(fakeRequest({ city: "delhi", messages: [{ role: "user", content: "hi" }] }), o)).ok).toBeTrue();
    // A different IP is not affected by the previous IP's exhausted bucket.
    expect((await guardRoute(fakeRequest({ city: "delhi", messages: [{ role: "user", content: "hi" }] }), o)).ok).toBeTrue();
  });

  it("applies the schema of the specific route", async () => {
    const guard = await guardRoute(
      fakeRequest({ city: "delhi", origin: "a", destination: "b" }),
      opts({ schema: commuteRequestSchema })
    );
    expect(guard.ok).toBeFalse();
    if (!guard.ok) {
      expect(guard.response.status).toBe(400);
    }
  });
});

describe("routeError", () => {
  it("logs and returns the message with the given status", () => {
    const res: NextResponse = routeError("test route", new Error("boom"), "It broke.", 500);
    expect(res.status).toBe(500);
    return res.json().then((payload) => {
      expect((payload as { error: string }).error).toBe("It broke.");
    });
  });

  it("defaults to 502 for upstream failures", () => {
    expect(routeError("t", new Error("x"), "Upstream broke.").status).toBe(502);
  });
});
