/**
 * Integration tests for getAirQuality in src/lib/air-quality-server.ts.
 *
 * The function is the product's core data pipeline: live Open-Meteo fetch
 * (with one retry), CPCB unit conversions, hourly trimming, a deterministic
 * offline fallback, and a per-city cache. The upstream fetch is stubbed per
 * test; each test uses a DIFFERENT city id so the module-level cache cannot
 * leak a snapshot from one test into the next (the cache test is the one
 * deliberate exception, calling delhi twice on purpose).
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getAirQuality } from "./air-quality-server";
import { subIndex } from "./aqi";

// ---------------------------------------------------------------------------
// fetch stubbing
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
let calls: string[] = [];

type Handler = (url: string, attempt: number) => Response | Promise<Response>;

function stubFetch(handler: Handler): void {
  calls = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    return handler(url, calls.length);
  }) as typeof fetch;
}

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const bad = (): Response => new Response("upstream exploded", { status: 500 });

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------------------
// Open-Meteo fixture builder
// ---------------------------------------------------------------------------

/**
 * 49 hourly stamps from 2026-01-14T12:00 to 2026-01-16T12:00 with a null
 * PM2.5 planted at the FIRST past hour and at the LAST future hour, plus a
 * "current" reading taken at 2026-01-15T12:00. Relative to that current
 * hour this yields 24 valid past points (14T12 skipped) and 23 valid future
 * points (16T12 skipped) — both null guards and the 24/24 trim are proven.
 */
function omPayload(): {
  current: Record<string, string | number>;
  hourly: { time: string[]; pm2_5: (number | null)[] };
} {
  const times: string[] = [];
  const values: (number | null)[] = [];
  for (let h = 0; h < 49; h++) {
    const d = new Date(Date.UTC(2026, 0, 14, 12) + h * 3600_000);
    times.push(`${d.toISOString().slice(0, 13)}:00`);
    values.push(90 + (h % 10));
  }
  values[0] = null; // 14T12:00 — skipped by the null guard
  values[48] = null; // 16T12:00 — skipped by the null guard
  return {
    current: {
      time: "2026-01-15T12:00",
      pm2_5: 300.44,
      pm10: 350,
      nitrogen_dioxide: 60,
      sulphur_dioxide: 40,
      ozone: 25,
      carbon_monoxide: 500, // µg/m³ from Open-Meteo
    },
    hourly: { time: times, pm2_5: values },
  };
}

// ---------------------------------------------------------------------------
// Live path (Open-Meteo)
// ---------------------------------------------------------------------------

describe("getAirQuality — live Open-Meteo path (delhi)", () => {
  beforeEach(() => stubFetch(() => ok(omPayload())));

  it("returns an open-meteo snapshot for the requested city", async () => {
    const snap = await getAirQuality("delhi");
    expect(snap.source).toBe("open-meteo");
    expect(snap.city.id).toBe("delhi");
    expect(Number.isFinite(Date.parse(snap.updatedAt))).toBe(true);
  });

  it("fetches the documented Open-Meteo endpoint with all pollutants", async () => {
    await getAirQuality("jaipur"); // fresh city — not yet cached by this file
    expect(calls[0]).toContain("air-quality-api.open-meteo.com/v1/air-quality");
    expect(calls[0]).toContain("latitude=26.9124&longitude=75.7873");
    expect(calls[0]).toContain(
      "current=pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide"
    );
    expect(calls[0]).toContain("hourly=pm2_5");
  });

  it("converts CO from µg/m³ to CPCB mg/m³ and rounds values to 1 decimal", async () => {
    const { pollutants } = (await getAirQuality("delhi")).current;
    const co = pollutants.find((p) => p.key === "co");
    expect(co?.value).toBe(0.5); // 500 µg/m³ → 0.5 mg/m³
    expect(co?.unit).toBe("mg/m³");
    const pm25 = pollutants.find((p) => p.key === "pm25");
    expect(pm25?.value).toBe(300.4); // 300.44 → 300.4
  });

  it("derives the overall AQI and dominant pollutant from the in-overall drivers", async () => {
    const snap = await getAirQuality("delhi");
    const expected = Math.max(
      subIndex("pm25", 300.44),
      subIndex("pm10", 350),
      subIndex("no2", 60),
      subIndex("so2", 40)
    );
    expect(snap.current.aqi).toBe(expected);
    expect(snap.current.aqi).toBeGreaterThan(0);
    expect(["pm25", "pm10", "no2", "so2"]).toContain(snap.current.dominant);
  });

  it("trims hourly to 24 past + 24 future, skipping null PM2.5 hours", async () => {
    const { hourly } = await getAirQuality("delhi");
    expect(hourly).toHaveLength(47); // 24 valid past + 23 valid future (16T12 null)
    expect(hourly[0].time).toBe("2026-01-14T13:00"); // 14T12 was null
    expect(hourly[23].time).toBe("2026-01-15T12:00"); // == current hour
    expect(hourly[23].future).toBe(false); // equal hour is NOT future
    expect(hourly[24].time).toBe("2026-01-15T13:00");
    expect(hourly[24].future).toBe(true);
    expect(hourly.at(-1)?.time).toBe("2026-01-16T11:00"); // 16T12 was null
  });

  it("rounds hourly PM2.5 to one decimal and labels each point's category", async () => {
    const { hourly } = await getAirQuality("delhi");
    for (const p of hourly) {
      expect(p.pm25).toBe(Math.round(p.pm25 * 10) / 10);
      expect(p.category).toBeString();
      expect(p.aqi).toBe(subIndex("pm25", p.pm25));
    }
  });

  it("caches per city: a second call does no fetch and returns the same snapshot", async () => {
    const first = await getAirQuality("gurugram"); // fresh city for cache counting
    expect(calls).toHaveLength(1);
    const second = await getAirQuality("gurugram");
    expect(second).toBe(first); // identical object reference — served from cache
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Fallback + retry behaviour
// ---------------------------------------------------------------------------

describe("getAirQuality — offline fallback and retry", () => {
  it("retries once on HTTP 500 before falling back (kolkata)", async () => {
    stubFetch(() => bad());
    const snap = await getAirQuality("kolkata");
    expect(calls).toHaveLength(2); // one retry, then give up
    expect(snap.source).toBe("simulated");
    expect(snap.current.aqi).toBeGreaterThan(0);
    expect(snap.current.pollutants.length).toBeGreaterThan(0);
    expect(Array.isArray(snap.bestWindows)).toBe(true);
    expect(snap.hourly.length).toBeGreaterThanOrEqual(48);
  });

  it("falls back when the network throws outright (mumbai)", async () => {
    stubFetch(() => {
      throw new Error("ETIMEDOUT");
    });
    const snap = await getAirQuality("mumbai");
    expect(calls).toHaveLength(2);
    expect(snap.source).toBe("simulated");
    expect(snap.city.name).toBe("Mumbai");
  });

  it("falls back on an incomplete payload even with HTTP 200 (chennai)", async () => {
    stubFetch(() => ok({ current: { time: "2026-01-15T12:00", pm2_5: 40 } })); // no hourly
    const snap = await getAirQuality("chennai");
    expect(calls).toHaveLength(2);
    expect(snap.source).toBe("simulated");
  });

  it("recovers when the retry succeeds (noida)", async () => {
    stubFetch((_url, attempt) => (attempt === 1 ? bad() : ok(omPayload())));
    const snap = await getAirQuality("noida");
    expect(calls).toHaveLength(2);
    expect(snap.source).toBe("open-meteo");
  });
});
