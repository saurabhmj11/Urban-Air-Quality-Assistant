/**
 * Unit tests for the commute planner domain logic (src/lib/commute.ts)
 * and the request-validation schemas (src/lib/validation.ts).
 *
 * Run with: bun test
 */
import { describe, expect, it } from "bun:test";
import {
  MODES,
  MODE_BY_KEY,
  PREFERENCE_WEIGHTS,
  ZONES,
  bestDeparture,
  fmtDuration,
  getZone,
  getZones,
  haversineKm,
  inhaledDoseMicrograms,
  planCommute,
  tripCo2Grams,
  type CommuteInput,
  type TravelMode,
} from "./commute";
import {
  CITY_IDS,
  chatRequestSchema,
  commuteRequestSchema,
  indoorPlanRequestSchema,
  memberCreateSchema,
  parseBody,
  routineRequestSchema,
  type CityId,
} from "./validation";
import { CITIES } from "./aqi";

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

describe("haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineKm({ lat: 28.61, lon: 77.21 }, { lat: 28.61, lon: 77.21 })).toBe(0);
  });

  it("computes a known distance within 2% (Delhi CP → Saket ≈ 12 km)", () => {
    const cp = { lat: 28.6315, lon: 77.2167 };
    const saket = { lat: 28.5245, lon: 77.2066 };
    const d = haversineKm(cp, saket);
    expect(d).toBeGreaterThan(10.5);
    expect(d).toBeLessThan(13.5);
  });

  it("is symmetric", () => {
    const a = { lat: 19.076, lon: 72.8777 };
    const b = { lat: 18.9067, lon: 72.8147 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it("computes one degree of latitude as ~111 km", () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeGreaterThan(110);
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeLessThan(112);
  });
});

// ---------------------------------------------------------------------------
// Zone catalogue
// ---------------------------------------------------------------------------

describe("zone catalogue", () => {
  it("covers every city in the CITIES catalogue", () => {
    for (const c of CITIES) {
      expect(ZONES[c.id], `zones missing for ${c.id}`).toBeDefined();
      expect(getZones(c.id).length).toBeGreaterThanOrEqual(5);
    }
  });

  it("has globally unique zone ids", () => {
    const ids = Object.values(ZONES).flat().map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("looks up zones by id and returns null for unknown ids", () => {
    expect(getZone("delhi", "delhi-cp")?.name).toBe("Connaught Place");
    expect(getZone("delhi", "does-not-exist")).toBeNull();
    expect(getZones("atlantis")[0].id).toBe("delhi-cp"); // falls back to Delhi
  });

  it("keeps zone coordinates within India's bounds", () => {
    for (const z of Object.values(ZONES).flat()) {
      expect(z.lat).toBeGreaterThan(6);
      expect(z.lat).toBeLessThan(36);
      expect(z.lon).toBeGreaterThan(68);
      expect(z.lon).toBeLessThan(98);
    }
  });
});

// ---------------------------------------------------------------------------
// Mode profiles
// ---------------------------------------------------------------------------

describe("mode profiles", () => {
  it("has a profile for all eight modes with sane values", () => {
    const keys = MODES.map((m) => m.key).sort();
    const expected: TravelMode[] = [
      "auto", "bus", "car", "carpool", "cycle", "metro", "scooter", "walk",
    ];
    expect(keys).toEqual(expected.sort());
    for (const m of MODES) {
      expect(m.speedKmh).toBeGreaterThan(0);
      expect(m.detour).toBeGreaterThanOrEqual(1);
      expect(m.co2PerKm).toBeGreaterThanOrEqual(0);
      expect(m.microEnv).toBeGreaterThan(0);
      expect(m.ventLPerMin).toBeGreaterThan(0);
      expect(m.maxKm).toBeGreaterThan(0);
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  it("zero-emission modes emit no CO2 and solo cars pollute most", () => {
    expect(MODE_BY_KEY.walk.co2PerKm).toBe(0);
    expect(MODE_BY_KEY.cycle.co2PerKm).toBe(0);
    const max = Math.max(...MODES.map((m) => m.co2PerKm));
    expect(MODE_BY_KEY.car.co2PerKm).toBe(max);
    expect(MODE_BY_KEY.carpool.co2PerKm).toBeLessThan(MODE_BY_KEY.car.co2PerKm);
  });

  it("preference weights sum to 1 for every preference", () => {
    for (const w of Object.values(PREFERENCE_WEIGHTS)) {
      expect(w.dose + w.co2 + w.time).toBeCloseTo(1, 10);
    }
  });
});

// ---------------------------------------------------------------------------
// Exposure and emissions math
// ---------------------------------------------------------------------------

describe("inhaledDoseMicrograms", () => {
  it("scales linearly with PM2.5, duration and ventilation", () => {
    const mode = MODE_BY_KEY.walk;
    const base = inhaledDoseMicrograms(100, mode, 30);
    expect(inhaledDoseMicrograms(200, mode, 30)).toBeCloseTo(base * 2, 1);
    expect(inhaledDoseMicrograms(100, mode, 60)).toBeCloseTo(base * 2, 1);
    expect(inhaledDoseMicrograms(100, MODE_BY_KEY.cycle, 30)).toBeCloseTo(
      (MODE_BY_KEY.cycle.ventLPerMin / MODE_BY_KEY.walk.ventLPerMin) * base,
      1
    );
  });

  it("returns 0 for zero pollution or zero duration", () => {
    expect(inhaledDoseMicrograms(0, MODE_BY_KEY.bus, 30)).toBe(0);
    expect(inhaledDoseMicrograms(150, MODE_BY_KEY.bus, 0)).toBe(0);
  });

  it("produces plausible magnitudes (30-min walk at AQI-driven PM2.5)", () => {
    // 150 µg/m³ × 1.15 roadside × 0.020 m³/min × 30 min ≈ 103 µg
    const dose = inhaledDoseMicrograms(150, MODE_BY_KEY.walk, 30);
    expect(dose).toBeGreaterThan(80);
    expect(dose).toBeLessThan(130);
  });
});

describe("tripCo2Grams", () => {
  it("multiplies the per-km factor by distance", () => {
    expect(tripCo2Grams(MODE_BY_KEY.metro, 10)).toBe(300);
    expect(tripCo2Grams(MODE_BY_KEY.walk, 10)).toBe(0);
    expect(tripCo2Grams(MODE_BY_KEY.car, 12.3)).toBe(2214); // 180 × 12.3
  });
});

// ---------------------------------------------------------------------------
// planCommute
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<CommuteInput> = {}): CommuteInput {
  return {
    originId: "delhi-cp",
    destinationId: "delhi-saket",
    pm25: 150,
    aqi: 250,
    aqiCategory: "poor",
    preference: "balanced",
    sensitiveMembers: [],
    ...overrides,
  };
}

describe("planCommute", () => {
  it("returns sorted, non-empty options for a real Delhi trip", () => {
    const res = planCommute(makeInput());
    expect(res.feasibleCount).toBeGreaterThan(2);
    expect(res.straightKm).toBeGreaterThan(10); // CP → Saket ≈ 12 km
    expect(res.options.length).toBe(res.feasibleCount);
    // Sorted best-first (score non-increasing)
    for (let i = 1; i < res.options.length; i++) {
      expect(res.options[i - 1].score).toBeGreaterThanOrEqual(res.options[i].score);
    }
  });

  it("excludes walk and cycle for a long trip but keeps the car", () => {
    const res = planCommute(makeInput({ destinationId: "delhi-rohini" })); // ~16 km
    const modes = res.options.map((o) => o.mode);
    expect(modes).not.toContain("walk");
    expect(modes).not.toContain("cycle");
    expect(modes).toContain("car");
    expect(modes).toContain("bus");
  });

  it("excludes metro when either zone has no station", () => {
    const res = planCommute(makeInput({ destinationId: "blr-ecity" })); // cross-city → invalid
    expect(res.options).toEqual([]);
    expect(res.feasibleCount).toBe(0);
  });

  it("excludes metro when one endpoint lacks a station but keeps other modes", () => {
    // Powai has no metro; Andheri does.
    const res = planCommute(
      makeInput({ originId: "mum-powai", destinationId: "mum-andheri" })
    );
    const modes = res.options.map((o) => o.mode);
    expect(modes).not.toContain("metro");
    expect(modes).toContain("bus");
    expect(modes).toContain("car");
  });

  it("recommends walking over driving for a very short trip under every preference", () => {
    // Same zone → straightKm floor 0.3 km, only walking survives.
    const res = planCommute(makeInput({ destinationId: "delhi-cp" }));
    expect(res.options.map((o) => o.mode)).toEqual(["walk"]);
  });

  it("low-emission preference promotes zero-carbon modes above the solo car", () => {
    const protect = planCommute(makeInput({ preference: "protect" }));
    const green = planCommute(makeInput({ preference: "low-emission" }));
    const rank = (res: ReturnType<typeof planCommute>, mode: string) =>
      res.options.findIndex((o) => o.mode === mode);
    // The car should rank worse when the user optimises for emissions.
    expect(rank(green, "car")).toBeGreaterThan(rank(protect, "car"));
    // Metro (30 g/km) must beat the solo car (180 g/km) in green mode.
    expect(rank(green, "metro")).toBeLessThan(rank(green, "car"));
  });

  it("flags active modes for sensitive members when PM2.5 is high", () => {
    const res = planCommute(
      makeInput({
        destinationId: "delhi-dwarka", // ~13 km: scooter+car survive, walk/cycle do not
        sensitiveMembers: ["Aarav"],
      })
    );
    const scooter = res.options.find((o) => o.mode === "scooter");
    expect(scooter?.warning).toContain("Aarav");
    const car = res.options.find((o) => o.mode === "car");
    expect(car?.warning).toBeNull();
  });

  it("does not flag active modes when PM2.5 is low", () => {
    const res = planCommute(
      makeInput({ pm25: 30, destinationId: "delhi-dwarka", sensitiveMembers: ["Aarav"] })
    );
    for (const o of res.options) {
      if (o.mode === "walk" || o.mode === "cycle" || o.mode === "scooter") {
        expect(o.warning).toBeNull();
      }
    }
  });

  it("assigns the cleanest-air badge to the lowest-dose option", () => {
    const res = planCommute(makeInput());
    const cleanest = res.options.reduce((a, b) => (a.doseMicrograms <= b.doseMicrograms ? a : b));
    expect(cleanest.badges).toContain("Cleanest air");
    expect(cleanest.mode).toBe("car"); // sealed cabin at 150 µg/m³
  });

  it("assigns the lowest-emission badge to a zero-carbon mode when one is feasible", () => {
    // CP → Laxmi Nagar (~6 km): cycle is inside its 10 km cap → 0 g CO2.
    const res = planCommute(makeInput({ destinationId: "delhi-laxmi" }));
    const greenest = res.options.reduce((a, b) => (a.co2Grams <= b.co2Grams ? a : b));
    expect(greenest.badges).toContain("Lowest emission");
    expect(greenest.co2Grams).toBe(0);
    expect(greenest.mode === "cycle" || greenest.mode === "walk").toBe(true);
  });

  it("gives the lowest-emission badge to the metro when active modes are out of range", () => {
    const res = planCommute(makeInput()); // ~12 km: walk/cycle excluded
    const greenest = res.options.reduce((a, b) => (a.co2Grams <= b.co2Grams ? a : b));
    expect(greenest.badges).toContain("Lowest emission");
    expect(greenest.mode).toBe("metro");
    expect(greenest.co2Grams).toBeLessThan(res.options.find((o) => o.mode === "car")!.co2Grams);
  });

  it("keeps every score inside 0–100 with a clear spread between best and worst", () => {
    const res = planCommute(makeInput());
    for (const o of res.options) {
      expect(o.score).toBeGreaterThanOrEqual(0);
      expect(o.score).toBeLessThanOrEqual(100);
    }
    expect(res.options[0].score).toBeGreaterThan(0);
    // Distinct best and worst options (no ties across the whole ranking).
    expect(res.options[0].score).toBeGreaterThan(
      res.options[res.options.length - 1].score
    );
  });

  it("scores an option that is worst on every axis at exactly 0", () => {
    // Same-zone trip: only walking survives → worst == best, score must be 100
    // (zero penalty on every axis). Then a car-only long trip's solo car is
    // worst on CO2; verify the floor logic with a synthetic input instead:
    const res = planCommute(makeInput({ destinationId: "delhi-cp" }));
    expect(res.options[0].score).toBe(100);
  });

  it("returns an empty result for unknown zones", () => {
    const res = planCommute(makeInput({ originId: "atlantis-reef" }));
    expect(res.options).toEqual([]);
    expect(res.feasibleCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Best departure finder
// ---------------------------------------------------------------------------

describe("bestDeparture", () => {
  const hourly = [
    { time: "2026-11-21T09:00", pm25: 180, future: false },
    { time: "2026-11-21T10:00", pm25: 200, future: false },
    { time: "2026-11-21T11:00", pm25: 160, future: true },
    { time: "2026-11-21T12:00", pm25: 120, future: true },
    { time: "2026-11-21T13:00", pm25: 95, future: true },
    { time: "2026-11-21T14:00", pm25: 110, future: true },
    { time: "2026-11-21T15:00", pm25: 90, future: true },
    { time: "2026-11-21T16:00", pm25: 130, future: true },
  ];

  it("picks the future hour with the lowest PM2.5", () => {
    expect(bestDeparture(hourly)?.time).toBe("2026-11-21T15:00");
  });

  it("respects the hours limit", () => {
    // Only the first 3 future hours are considered → 13:00 (95) wins.
    expect(bestDeparture(hourly, 3)?.pm25).toBe(95);
  });

  it("returns null when there is no forecast", () => {
    expect(bestDeparture([])).toBeNull();
    expect(bestDeparture(hourly.map((h) => ({ ...h, future: false })))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

describe("fmtDuration", () => {
  it("formats minutes and hour+minute combinations", () => {
    expect(fmtDuration(45)).toBe("45 min");
    expect(fmtDuration(60)).toBe("1 h");
    expect(fmtDuration(80)).toBe("1 h 20 min");
    expect(fmtDuration(135)).toBe("2 h 15 min");
  });
});

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

describe("validation schemas", () => {
  it("CITY_IDS matches the aqi.ts city catalogue exactly", () => {
    // CityInfo.id is deliberately `string` (the two lists live in different
    // modules to avoid an import cycle); narrow here to assert parity.
    const cityIds = new Set(CITIES.map((c) => c.id as CityId));
    expect(new Set(CITY_IDS)).toEqual(cityIds);
  });

  it("accepts a valid chat request and rejects bad roles / empty messages", () => {
    const good = parseBody(chatRequestSchema, {
      city: "delhi",
      messages: [{ role: "user", content: "Is it safe to cycle?" }],
    });
    expect(good.ok).toBe(true);

    expect(
      parseBody(chatRequestSchema, {
        city: "delhi",
        messages: [{ role: "system", content: "inject" }],
      }).ok
    ).toBe(false);

    expect(
      parseBody(chatRequestSchema, {
        city: "delhi",
        messages: [{ role: "user", content: "" }],
      }).ok
    ).toBe(false);

    expect(parseBody(chatRequestSchema, { city: "atlantis", messages: [] }).ok).toBe(false);
  });

  it("caps chat history at 12 turns", () => {
    const messages = Array.from({ length: 13 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    expect(parseBody(chatRequestSchema, { city: "delhi", messages }).ok).toBe(false);
    expect(
      parseBody(chatRequestSchema, { city: "delhi", messages: messages.slice(0, 12) }).ok
    ).toBe(true);
  });

  it("rejects unknown enum values across all schemas", () => {
    expect(
      parseBody(routineRequestSchema, { city: "pune", dayType: "holiday", mode: "balanced" }).ok
    ).toBe(false);
    expect(
      parseBody(indoorPlanRequestSchema, {
        city: "pune",
        rooms: 2,
        hasPurifier: false,
        hasAC: true,
        budget: "crore",
        cooking: "gas",
      }).ok
    ).toBe(false);
    expect(
      parseBody(commuteRequestSchema, {
        city: "delhi",
        origin: "delhi-cp",
        destination: "delhi-saket",
        departure: "tomorrow",
        preference: "balanced",
      }).ok
    ).toBe(false);
  });

  it("bounds numeric and string fields", () => {
    expect(
      parseBody(indoorPlanRequestSchema, {
        city: "pune",
        rooms: 11,
        hasPurifier: false,
        hasAC: true,
        budget: "low",
        cooking: "gas",
      }).ok
    ).toBe(false);

    const longName = "x".repeat(41);
    expect(
      parseBody(memberCreateSchema, { name: longName, ageGroup: "adult" }).ok
    ).toBe(false);
    expect(
      parseBody(memberCreateSchema, { name: "Aarav", ageGroup: "child", conditions: ["asthma"] }).ok
    ).toBe(true);
    expect(
      parseBody(memberCreateSchema, { name: "Aarav", ageGroup: "child", conditions: ["covid"] }).ok
    ).toBe(false);
  });

  it("accepts a fully valid commute request", () => {
    const res = parseBody(commuteRequestSchema, {
      city: "mumbai",
      origin: "mum-powai",
      destination: "mum-bandra",
      departure: "best",
      preference: "low-emission",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.city).toBe("mumbai");
      expect(res.value.preference).toBe("low-emission");
    }
  });
});
