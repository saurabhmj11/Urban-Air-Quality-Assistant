/**
 * Unit tests for the pure domain logic in src/lib/aqi.ts.
 *
 * Covers CPCB NAQI sub-index math, category bands, best-window finding,
 * family sensitivity scoring, risk verdicts and the offline simulation.
 *
 * Run with: bun test
 */
import { describe, expect, it } from "bun:test";
import {
  CATEGORY_INFO,
  CITIES,
  categoryOf,
  findBestWindows,
  fmtHour,
  getCity,
  memberRiskVerdict,
  sensitivityFor,
  simulateCurrentPollutants,
  simulateHourlyPm25,
  subIndex,
  type HourlyPoint,
} from "./aqi";

// ---------------------------------------------------------------------------
// CPCB sub-index math
// ---------------------------------------------------------------------------

describe("subIndex (CPCB NAQI breakpoints)", () => {
  it("maps PM2.5 band boundaries exactly (CPCB table)", () => {
    // [concentration µg/m³, expected sub-index]
    const cases: [number, number][] = [
      [0, 0],
      [30, 50], // Good / Satisfactory boundary
      [60, 100], // Satisfactory / Moderate boundary
      [90, 200], // Moderate / Poor boundary
      [120, 300], // Poor / Very Poor boundary
      [250, 400], // Very Poor / Severe boundary
      [500, 500], // top of Severe band
    ];
    for (const [value, expected] of cases) {
      expect(subIndex("pm25", value)).toBe(expected);
    }
  });

  it("interpolates linearly inside a band", () => {
    // PM2.5 40 µg/m³ sits inside 30–60 → 51–100: (49/30)*10+51 = 67.33 → 67
    expect(subIndex("pm25", 40)).toBe(67);
    // PM2.5 80 µg/m³ sits inside 60–90 → 101–200: (99/30)*20+101 = 167
    expect(subIndex("pm25", 80)).toBe(167);
  });

  it("clamps above the highest breakpoint to 500", () => {
    expect(subIndex("pm25", 800)).toBe(500);
    expect(subIndex("pm10", 2000)).toBe(500);
  });

  it("returns 0 for negative or non-finite input", () => {
    expect(subIndex("pm25", -5)).toBe(0);
    expect(subIndex("pm25", NaN)).toBe(0);
    expect(subIndex("pm25", Infinity)).toBe(0); // guarded as non-finite
  });

  it("uses mg/m³ for CO and µg/m³ for the other pollutants", () => {
    expect(subIndex("co", 1)).toBe(50); // 1 mg/m³ = Good boundary
    expect(subIndex("co", 2)).toBe(100);
    expect(subIndex("no2", 40)).toBe(50);
    expect(subIndex("so2", 80)).toBe(100);
    expect(subIndex("o3", 50)).toBe(50);
    expect(subIndex("pm10", 50)).toBe(50);
    expect(subIndex("pm10", 100)).toBe(100);
  });

  it("is monotonic non-decreasing across a sweep of PM2.5 values", () => {
    let prev = -1;
    for (let v = 0; v <= 600; v += 7) {
      const si = subIndex("pm25", v);
      expect(si).toBeGreaterThanOrEqual(prev);
      expect(si).toBeLessThanOrEqual(500);
      prev = si;
    }
  });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

describe("categoryOf", () => {
  it("assigns the six CPCB bands, inclusive of upper bounds", () => {
    const cases: [number, string][] = [
      [0, "good"],
      [50, "good"],
      [51, "satisfactory"],
      [100, "satisfactory"],
      [101, "moderate"],
      [200, "moderate"],
      [201, "poor"],
      [300, "poor"],
      [301, "very-poor"],
      [400, "very-poor"],
      [401, "severe"],
      [500, "severe"],
    ];
    for (const [aqi, expected] of cases) {
      expect(categoryOf(aqi)).toBe(expected);
    }
  });

  it("has complete metadata (label, colour, advice) for every band", () => {
    for (const key of Object.keys(CATEGORY_INFO) as (keyof typeof CATEGORY_INFO)[]) {
      const info = CATEGORY_INFO[key];
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(info.advice.length).toBeGreaterThan(10);
      expect(categoryOf(key === "good" ? 10 : key === "satisfactory" ? 75 : key === "moderate" ? 150 : key === "poor" ? 250 : key === "very-poor" ? 350 : 450)).toBe(key);
    }
  });
});

// ---------------------------------------------------------------------------
// City catalogue
// ---------------------------------------------------------------------------

describe("city catalogue", () => {
  it("has unique ids and valid coordinates for all cities", () => {
    const ids = new Set<string>();
    for (const c of CITIES) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.lat).toBeGreaterThan(6);
      expect(c.lat).toBeLessThan(36); // India latitude range
      expect(c.lon).toBeGreaterThan(68);
      expect(c.lon).toBeLessThan(98); // India longitude range
    }
  });

  it("falls back to Delhi for an unknown city id", () => {
    expect(getCity("atlantis").id).toBe("delhi");
    expect(getCity("delhi").name).toBe("Delhi");
  });
});

// ---------------------------------------------------------------------------
// Best-window finder
// ---------------------------------------------------------------------------

function pt(hour: number, aqi: number, future = true): HourlyPoint {
  const hh = String(hour).padStart(2, "0");
  return {
    time: `2026-11-21T${hh}:00`,
    pm25: aqi / 2,
    aqi,
    category: categoryOf(aqi),
    future,
  };
}

describe("findBestWindows", () => {
  it("returns no windows when there is no forecast data", () => {
    expect(findBestWindows([])).toEqual([]);
    expect(findBestWindows([pt(10, 80, false)])).toEqual([]);
  });

  it("finds a clean afternoon window and ignores stretches shorter than 2 hours", () => {
    // Hours 13–16 are clean (≤100); hour 17 is a 1-hour dip that must be ignored.
    const points = [
      pt(11, 260), pt(12, 240),
      pt(13, 70), pt(14, 65), pt(15, 80), pt(16, 60),
      pt(17, 150), pt(18, 280), pt(19, 300),
    ];
    const windows = findBestWindows(points);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    const best = windows[0];
    expect(best.startHour).toBe(13);
    expect(best.endHour).toBe(17); // 4-hour stretch, ends after hour 16
    expect(best.avgAqi).toBe(Math.round((70 + 65 + 80 + 60) / 4));
    expect(best.label).toBe("1PM–5PM");
    // The 1-hour dip at 17:00 must not appear as its own window
    expect(windows.some((w) => w.startHour === 17)).toBe(false);
  });

  it("falls back to ≤200 then least-bad when no ≤100 stretch exists", () => {
    const points = [
      pt(9, 340), pt(10, 330), pt(11, 150), pt(12, 140), pt(13, 160), pt(14, 360),
    ];
    const windows = findBestWindows(points);
    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0].avgAqi).toBeLessThanOrEqual(200);
    expect(windows[0].startHour).toBe(11);
    expect(windows[0].endHour).toBe(14);
  });

  it("sorts windows best-first and caps the result at 3", () => {
    // Five clean (≤100) stretches separated by smoggy hours → only the best
    // three are returned, sorted by average AQI.
    const points = [
      pt(10, 60), pt(11, 60), pt(12, 300),
      pt(13, 70), pt(14, 70), pt(15, 300),
      pt(16, 80), pt(17, 80), pt(18, 300),
      pt(19, 65), pt(20, 65), pt(21, 300),
      pt(22, 90), pt(23, 90),
    ];
    const windows = findBestWindows(points);
    expect(windows.length).toBe(3);
    expect(windows[0].avgAqi).toBeLessThanOrEqual(windows[1].avgAqi);
    expect(windows[1].avgAqi).toBeLessThanOrEqual(windows[2].avgAqi);
    expect(windows[0].avgAqi).toBe(60); // the 10AM–12PM window wins
    expect(windows[0].startHour).toBe(10);
    expect(windows[0].endHour).toBe(12);
  });

  it("handles windows that cross midnight (hour wrap in the label)", () => {
    const points = [...[22, 23].map((h) => pt(h, 80)), ...[0, 1].map((h) => pt(h, 75))];
    const windows = findBestWindows(points);
    expect(windows[0].startHour).toBe(22);
    expect(windows[0].label).toBe("10PM–2AM");
  });
});

// ---------------------------------------------------------------------------
// Hour formatting
// ---------------------------------------------------------------------------

describe("fmtHour", () => {
  it("formats 12-hour clock with AM/PM and wraps around midnight", () => {
    const cases: [number, string][] = [
      [0, "12AM"], [11, "11AM"], [12, "12PM"], [13, "1PM"],
      [23, "11PM"], [24, "12AM"], [-1, "11PM"], [25, "1AM"],
    ];
    for (const [h, expected] of cases) {
      expect(fmtHour(h)).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// Family sensitivity scoring
// ---------------------------------------------------------------------------

describe("sensitivityFor", () => {
  it("scores a healthy adult as low sensitivity", () => {
    const s = sensitivityFor("adult", "");
    expect(s.score).toBe(0);
    expect(s.band).toBe("low");
    expect(s.reasons).toEqual([]);
  });

  it("scores age groups (children and seniors are more vulnerable)", () => {
    expect(sensitivityFor("child", "").score).toBe(35);
    expect(sensitivityFor("child", "").band).toBe("high");
    expect(sensitivityFor("senior", "").score).toBe(30);
    expect(sensitivityFor("senior", "").band).toBe("moderate"); // 30 < 35
    expect(sensitivityFor("teen", "").score).toBe(15);
    expect(sensitivityFor("teen", "").band).toBe("moderate");
  });

  it("adds condition points and lists them as reasons", () => {
    const s = sensitivityFor("adult", "asthma,heart");
    expect(s.score).toBe(55); // 30 + 25
    expect(s.band).toBe("high");
    expect(s.reasons).toContain("Asthma");
    expect(s.reasons).toContain("Heart condition");
  });

  it("ignores unknown condition keys and whitespace", () => {
    const s = sensitivityFor("adult", " , unknown-condition , asthma , ");
    expect(s.score).toBe(30);
    expect(s.reasons).toEqual(["Asthma"]);
  });

  it("clamps the total score at 100 (child with asthma + COPD + heart)", () => {
    const s = sensitivityFor("child", "asthma,copd,heart");
    expect(s.score).toBe(100); // 35 + 30 + 30 + 25 = 120 → clamped
    expect(s.band).toBe("very-high");
  });

  it("maps scores onto the four sensitivity bands", () => {
    expect(sensitivityFor("adult", "smoker").band).toBe("low"); // 10
    expect(sensitivityFor("adult", "diabetes").band).toBe("low"); // 10
    expect(sensitivityFor("adult", "pregnancy").band).toBe("moderate"); // 20
    expect(sensitivityFor("adult", "asthma").band).toBe("moderate"); // 30
    expect(sensitivityFor("senior", "pregnancy").band).toBe("high"); // 50
    expect(sensitivityFor("child", "asthma").band).toBe("very-high"); // 65
  });
});

// ---------------------------------------------------------------------------
// Risk verdicts
// ---------------------------------------------------------------------------

describe("memberRiskVerdict", () => {
  it("keeps very-high-sensitivity members indoors once air is moderate or worse", () => {
    expect(memberRiskVerdict("very-high", "good")).toBe("Short outdoor stints only");
    expect(memberRiskVerdict("very-high", "satisfactory")).toBe("Short outdoor stints only");
    expect(memberRiskVerdict("very-high", "moderate")).toBe("Keep indoors — filter air");
    expect(memberRiskVerdict("very-high", "severe")).toBe("Keep indoors — filter air");
  });

  it("escalates verdicts as air worsens for high-sensitivity members", () => {
    expect(memberRiskVerdict("high", "good")).toBe("Cleared for outdoors");
    expect(memberRiskVerdict("high", "moderate")).toBe("Limit prolonged outdoor time");
    expect(memberRiskVerdict("high", "poor")).toBe("Avoid outdoor exertion");
  });

  it("gives low-sensitivity members the all-clear except in severe air", () => {
    expect(memberRiskVerdict("low", "poor")).toBe("Good to go outside");
    expect(memberRiskVerdict("low", "severe")).toBe("Even healthy lungs should stay in");
  });
});

// ---------------------------------------------------------------------------
// Offline simulation (deterministic fallback)
// ---------------------------------------------------------------------------

describe("offline simulation", () => {
  it("is deterministic — same inputs always produce the same series", () => {
    const base = new Date("2026-11-21T00:00:00Z");
    const a = simulateHourlyPm25("delhi", base, 48);
    const b = simulateHourlyPm25("delhi", base, 48);
    expect(a).toEqual(b);
  });

  it("returns the requested number of hours with positive PM2.5 values", () => {
    const series = simulateHourlyPm25("kanpur", new Date(), 49);
    expect(series.length).toBe(49);
    for (const h of series) {
      expect(h.pm25).toBeGreaterThan(0);
      expect(h.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    }
  });

  it("produces higher pollution at night/dawn than mid-afternoon (winter inversion)", () => {
    const series = simulateHourlyPm25("delhi", new Date("2026-11-21T00:00:00Z"), 48);
    const byHour = new Map<number, number>();
    for (const h of series) byHour.set(Number(h.time.slice(11, 13)), h.pm25);
    const nightAvg = ((byHour.get(3) ?? 0) + (byHour.get(4) ?? 0)) / 2;
    const afternoonAvg = ((byHour.get(15) ?? 0) + (byHour.get(16) ?? 0)) / 2;
    expect(nightAvg).toBeGreaterThan(afternoonAvg);
  });

  it("returns all six pollutants with plausible magnitudes", () => {
    const p = simulateCurrentPollutants("delhi", 160);
    expect(Object.keys(p).sort()).toEqual(["co", "no2", "o3", "pm10", "pm25", "so2"]);
    expect(p.pm25).toBe(160);
    expect(p.pm10).toBeGreaterThan(160); // PM10 exceeds PM2.5 in smog
    expect(p.co).toBeLessThan(10); // mg/m³
    for (const v of Object.values(p)) expect(v).toBeGreaterThan(0);
  });
});
