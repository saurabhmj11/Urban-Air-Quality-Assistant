/**
 * Unit tests for the snapshot→prompt serializers in
 * src/lib/air-quality-server.ts.
 *
 * These functions build the LIVE CONTEXT injected into every GenAI prompt;
 * their exact shape (what is included, what is truncated, fallback wording
 * when there is nothing good to say) is part of the product's correctness,
 * so it is pinned by tests rather than left to eyeballing.
 */
import { describe, expect, it } from "bun:test";
import {
  snapshotToContext,
  snapshotToContextBrief,
} from "./air-quality-server";
import type { AirQualitySnapshot, HourlyPoint } from "./aqi";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const hourly = (n: number, future: boolean): HourlyPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    time: `2026-01-1${future ? 5 : 4}T${String(10 + i).padStart(2, "0")}:00`,
    pm25: 100 + i,
    aqi: 200 + i,
    category: "moderate",
    future,
  }));

const snapshot: AirQualitySnapshot = {
  city: { id: "delhi", name: "Delhi", state: "NCT of Delhi", lat: 28.6139, lon: 77.209 },
  source: "open-meteo",
  updatedAt: "2026-01-15T09:30:00.000Z",
  current: {
    aqi: 342,
    category: "very-poor",
    dominant: "pm25",
    pollutants: [
      {
        key: "pm25",
        name: "PM2.5",
        value: 219.5,
        unit: "µg/m³",
        subIndex: 342,
        category: "very-poor",
        inOverall: true,
      },
    ],
  },
  hourly: [...hourly(24, false), ...hourly(24, true)],
  bestWindows: [
    { startHour: 15, endHour: 17, avgAqi: 155, label: "3PM–5PM" },
    { startHour: 22, endHour: 24, avgAqi: 190, label: "10PM–12AM" },
  ],
};

const noWindows: AirQualitySnapshot = {
  ...snapshot,
  bestWindows: [],
};

// ---------------------------------------------------------------------------
// snapshotToContext (full)
// ---------------------------------------------------------------------------

describe("snapshotToContext (full prompt serializer)", () => {
  it("leads with city, state, source and update timestamp", () => {
    const out = snapshotToContext(snapshot);
    const [first] = out.split("\n");
    expect(first).toContain("Delhi (NCT of Delhi)");
    expect(first).toContain("open-meteo");
    expect(first).toContain("2026-01-15T09:30:00.000Z");
  });

  it("states the AQI, label and dominant pollutant", () => {
    const out = snapshotToContext(snapshot);
    expect(out).toContain("Current AQI: 342 (Very Poor)");
    expect(out).toContain("dominant pollutant pm25");
  });

  it("lists every pollutant with value, unit and sub-AQI", () => {
    const out = snapshotToContext(snapshot);
    expect(out).toContain("PM2.5 219.5µg/m³ (sub-AQI 342)");
  });

  it("serialises at most 12 future forecast hours as HH:MM=aqi", () => {
    const out = snapshotToContext(snapshot);
    expect(out).toContain("Next 12h PM2.5-AQI forecast:");
    expect(out).toContain("10:00=200");
    expect(out).toContain("21:00=211"); // 12th future point, still present
    expect(out).not.toContain("22:00=212"); // 13th future point, truncated
  });

  it("joins best-window labels in order", () => {
    const out = snapshotToContext(snapshot);
    expect(out).toContain("3PM–5PM, 10PM–12AM");
  });

  it("uses the honest fallback when no window exists", () => {
    expect(snapshotToContext(noWindows)).toContain(
      "none — air stays bad all day"
    );
  });
});

// ---------------------------------------------------------------------------
// snapshotToContextBrief (commute prompt serializer)
// ---------------------------------------------------------------------------

describe("snapshotToContextBrief (commute prompt serializer)", () => {
  it("emits exactly four compact lines", () => {
    expect(snapshotToContextBrief(snapshot).split("\n")).toHaveLength(4);
  });

  it("keeps the city line minimal (no state, no source, no timestamp)", () => {
    const [first] = snapshotToContextBrief(snapshot).split("\n");
    expect(first).toBe("City: Delhi");
  });

  it("keeps the AQI headline", () => {
    expect(snapshotToContextBrief(snapshot)).toContain(
      "Current AQI: 342 (Very Poor)"
    );
  });

  it("serialises at most 8 future forecast hours", () => {
    const out = snapshotToContextBrief(snapshot);
    expect(out).toContain("Next 8h AQI forecast:");
    expect(out).toContain("17:00=207"); // 8th future point
    expect(out).not.toContain("18:00=208"); // 9th future point, truncated
  });

  it("uses the commute-specific fallback when no window exists", () => {
    expect(snapshotToContextBrief(noWindows)).toContain("none today");
  });
});
