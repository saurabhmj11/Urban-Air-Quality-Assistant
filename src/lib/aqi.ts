/**
 * Core air-quality domain logic for BreathEasy.
 *
 * Pure functions only — safe to import from both client and server code.
 * Implements the CPCB National Air Quality Index (India) sub-index math,
 * city catalogue, advisories and a deterministic offline simulation
 * fallback used when the live data provider is unreachable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PollutantKey = "pm25" | "pm10" | "no2" | "so2" | "o3" | "co";

export type CategoryKey =
  | "good"
  | "satisfactory"
  | "moderate"
  | "poor"
  | "very-poor"
  | "severe";

export interface CityInfo {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
}

export interface PollutantReading {
  key: PollutantKey;
  name: string;
  value: number; // native unit (µg/m³, except CO in mg/m³)
  unit: string;
  subIndex: number; // AQI sub-index 0..500
  category: CategoryKey;
  /**
   * Whether this pollutant drives the OVERALL AQI. O3 and CO use 8-hour
   * CPCB standards but the live feed provides instantaneous model values,
   * so they are shown for information only to avoid overstating risk.
   */
  inOverall: boolean;
}

export interface HourlyPoint {
  time: string; // ISO local time (city timezone)
  pm25: number; // µg/m³
  aqi: number; // PM2.5 sub-index
  category: CategoryKey;
  future: boolean;
}

export interface BestWindow {
  startHour: number;
  endHour: number; // exclusive
  avgAqi: number;
  label: string;
}

export interface AirQualitySnapshot {
  city: CityInfo;
  source: "open-meteo" | "simulated";
  updatedAt: string;
  current: {
    aqi: number;
    category: CategoryKey;
    dominant: PollutantKey;
    pollutants: PollutantReading[];
  };
  hourly: HourlyPoint[]; // past 24h + next 24h
  bestWindows: BestWindow[];
}

// ---------------------------------------------------------------------------
// City catalogue (India — winter smog belt focus)
// ---------------------------------------------------------------------------

export const CITIES: CityInfo[] = [
  { id: "delhi", name: "Delhi", state: "NCT of Delhi", lat: 28.6139, lon: 77.209 },
  { id: "gurugram", name: "Gurugram", state: "Haryana", lat: 28.4595, lon: 77.0266 },
  { id: "noida", name: "Noida", state: "Uttar Pradesh", lat: 28.5355, lon: 77.391 },
  { id: "mumbai", name: "Mumbai", state: "Maharashtra", lat: 19.076, lon: 72.8777 },
  { id: "kolkata", name: "Kolkata", state: "West Bengal", lat: 22.5726, lon: 88.3639 },
  { id: "bengaluru", name: "Bengaluru", state: "Karnataka", lat: 12.9716, lon: 77.5946 },
  { id: "chennai", name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lon: 80.2707 },
  { id: "hyderabad", name: "Hyderabad", state: "Telangana", lat: 17.385, lon: 78.4867 },
  { id: "pune", name: "Pune", state: "Maharashtra", lat: 18.5204, lon: 73.8567 },
  { id: "jaipur", name: "Jaipur", state: "Rajasthan", lat: 26.9124, lon: 75.7873 },
  { id: "lucknow", name: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lon: 80.9462 },
  { id: "kanpur", name: "Kanpur", state: "Uttar Pradesh", lat: 26.4499, lon: 80.3319 },
];

export function getCity(id: string): CityInfo {
  return CITIES.find((c) => c.id === id) ?? CITIES[0];
}

// ---------------------------------------------------------------------------
// CPCB National AQI breakpoints
// ---------------------------------------------------------------------------

/** [BPlo, BPhi, ILo, IHi] per CPCB NAQI. Last band clamps to 500. */
const BREAKPOINTS: Record<PollutantKey, [number, number, number, number][]> = {
  // PM2.5 µg/m³ (24h)
  pm25: [
    [0, 30, 0, 50], [30, 60, 51, 100], [60, 90, 101, 200],
    [90, 120, 201, 300], [120, 250, 301, 400], [250, 500, 401, 500],
  ],
  // PM10 µg/m³ (24h)
  pm10: [
    [0, 50, 0, 50], [50, 100, 51, 100], [100, 250, 101, 200],
    [250, 350, 201, 300], [350, 430, 301, 400], [430, 600, 401, 500],
  ],
  // NO2 µg/m³ (24h)
  no2: [
    [0, 40, 0, 50], [40, 80, 51, 100], [80, 180, 101, 200],
    [180, 280, 201, 300], [280, 400, 301, 400], [400, 600, 401, 500],
  ],
  // SO2 µg/m³ (24h)
  so2: [
    [0, 40, 0, 50], [40, 80, 51, 100], [80, 380, 101, 200],
    [380, 800, 201, 300], [800, 1600, 301, 400], [1600, 2400, 401, 500],
  ],
  // O3 µg/m³ (8h)
  o3: [
    [0, 50, 0, 50], [50, 100, 51, 100], [100, 168, 101, 200],
    [168, 208, 201, 300], [208, 748, 301, 400], [748, 1000, 401, 500],
  ],
  // CO mg/m³ (8h)
  co: [
    [0, 1, 0, 50], [1, 2, 51, 100], [2, 10, 101, 200],
    [10, 17, 201, 300], [17, 34, 301, 400], [34, 50, 401, 500],
  ],
};

/** Compute a CPCB sub-index from a raw concentration. */
export function subIndex(key: PollutantKey, value: number): number {
  if (!isFinite(value) || value < 0) return 0;
  const bands = BREAKPOINTS[key];
  for (const [bpLo, bpHi, iLo, iHi] of bands) {
    if (value <= bpHi) {
      const idx = ((iHi - iLo) / (bpHi - bpLo)) * (value - bpLo) + iLo;
      return Math.round(Math.min(500, Math.max(0, idx)));
    }
  }
  return 500;
}

export function categoryOf(aqi: number): CategoryKey {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "satisfactory";
  if (aqi <= 200) return "moderate";
  if (aqi <= 300) return "poor";
  if (aqi <= 400) return "very-poor";
  return "severe";
}

export interface CategoryInfo {
  key: CategoryKey;
  label: string;
  range: string;
  color: string; // hex
  textOn: string; // readable text color on top of `color`
  advice: string;
}

export const CATEGORY_INFO: Record<CategoryKey, CategoryInfo> = {
  good: {
    key: "good", label: "Good", range: "0–50",
    color: "#16a34a", textOn: "#ffffff",
    advice: "Air is clean. Perfect day for outdoor play, walks and exercise.",
  },
  satisfactory: {
    key: "satisfactory", label: "Satisfactory", range: "51–100",
    color: "#eab308", textOn: "#422006",
    advice: "Minor breathing discomfort possible for sensitive people. Most activities are fine.",
  },
  moderate: {
    key: "moderate", label: "Moderate", range: "101–200",
    color: "#f97316", textOn: "#ffffff",
    advice: "Breathing discomfort for people with lung or heart disease, children and older adults. Limit prolonged outdoor exertion.",
  },
  poor: {
    key: "poor", label: "Poor", range: "201–300",
    color: "#ef4444", textOn: "#ffffff",
    advice: "Breathing discomfort for most people on prolonged exposure. Keep outdoor time short; masks (N95) help.",
  },
  "very-poor": {
    key: "very-poor", label: "Very Poor", range: "301–400",
    color: "#a855f7", textOn: "#ffffff",
    advice: "Respiratory illness on prolonged exposure. Avoid outdoor activity; run air purifiers; seal windows.",
  },
  severe: {
    key: "severe", label: "Severe", range: "401–500",
    color: "#881337", textOn: "#ffffff",
    advice: "Serious health impact even for healthy people. Stay indoors, filter indoor air, avoid all outdoor exertion.",
  },
};

export const POLLUTANT_META: Record<
  PollutantKey,
  { name: string; unit: string; full: string; inOverall: boolean }
> = {
  pm25: { name: "PM2.5", unit: "µg/m³", full: "Fine particulate matter (2.5 µm)", inOverall: true },
  pm10: { name: "PM10", unit: "µg/m³", full: "Coarse particulate matter (10 µm)", inOverall: true },
  no2: { name: "NO₂", unit: "µg/m³", full: "Nitrogen dioxide (traffic)", inOverall: true },
  so2: { name: "SO₂", unit: "µg/m³", full: "Sulphur dioxide (industry)", inOverall: true },
  o3: { name: "O₃", unit: "µg/m³", full: "Ground-level ozone (8h metric, shown for info)", inOverall: false },
  co: { name: "CO", unit: "mg/m³", full: "Carbon monoxide (8h metric, shown for info)", inOverall: false },
};

// ---------------------------------------------------------------------------
// Offline simulation fallback (deterministic, winter-smog shaped)
// ---------------------------------------------------------------------------

/** City baseline winter PM2.5 (µg/m³) used only when live fetch fails. */
const BASELINE_PM25: Record<string, number> = {
  delhi: 165, gurugram: 158, noida: 162, mumbai: 78, kolkata: 112,
  bengaluru: 48, chennai: 42, hyderabad: 72, pune: 84, jaipur: 128,
  lucknow: 148, kanpur: 172,
};

/** Small deterministic hash → jitter in [0,1). */
function hash01(...nums: number[]): number {
  let h = 2166136261;
  for (const n of nums) {
    h ^= Math.round(n * 1000);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** Diurnal smog curve: peaks late night/morning, dips mid-afternoon. */
function diurnalFactor(hour: number): number {
  // 1.25 at 3am (inversion), 0.72 at 3pm (mixing)
  return 0.98 + 0.27 * Math.cos(((hour - 3) / 24) * 2 * Math.PI);
}

/** All catalogue cities are in India (IST, UTC+5:30). */
const IST_OFFSET_MS = 5.5 * 3600_000;

export function simulateHourlyPm25(
  cityId: string,
  base: Date,
  hours: number
): { time: string; pm25: number }[] {
  const baseline = BASELINE_PM25[cityId] ?? 90;
  const out: { time: string; pm25: number }[] = [];
  for (let i = 0; i < hours; i++) {
    const d = new Date(base.getTime() + i * 3600_000);
    const ist = new Date(d.getTime() + IST_OFFSET_MS);
    const hour = ist.getUTCHours();
    const dayJitter = 0.82 + 0.36 * hash01(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), baseline);
    const hourJitter = 0.92 + 0.16 * hash01(ist.getUTCDate(), hour, i);
    const pm25 = baseline * diurnalFactor(hour) * dayJitter * hourJitter;
    out.push({
      time: ist.toISOString().slice(0, 16),
      pm25: Math.round(pm25 * 10) / 10,
    });
  }
  return out;
}

export function simulateCurrentPollutants(cityId: string, pm25: number): Record<PollutantKey, number> {
  const j = (salt: number) => 0.85 + 0.3 * hash01(salt, Math.round(pm25));
  return {
    pm25,
    pm10: pm25 * (1.05 + 0.3 * j(1)),
    no2: 18 + 46 * j(2),
    so2: 8 + 26 * j(3),
    o3: 22 + 58 * j(4),
    co: 0.4 + 1.6 * j(5), // mg/m³
  };
}

// ---------------------------------------------------------------------------
// Best-time windows (from forecast hourly points)
// ---------------------------------------------------------------------------

export function findBestWindows(points: HourlyPoint[]): BestWindow[] {
  const future = points.filter((p) => p.future);
  if (future.length === 0) return [];

  // Prefer the best achievable band: try "satisfactory", then "moderate",
  // finally fall back to the least-polluted stretch of the day.
  const thresholds = [100, 200, Infinity];
  for (const threshold of thresholds) {
    const windows: BestWindow[] = [];
    let start = -1;
    for (let i = 0; i <= future.length; i++) {
      const ok = i < future.length && future[i].aqi <= threshold;
      if (ok && start === -1) start = i;
      if (!ok && start !== -1) {
        if (i - start >= 2) {
          const slice = future.slice(start, i);
          const avg = Math.round(slice.reduce((s, p) => s + p.aqi, 0) / slice.length);
          // Times are naive ISO strings in the city's timezone — parse hour
          // from the string itself (never via Date, which would shift it).
          const sH = parseInt(slice[0].time.slice(11, 13), 10);
          const eH = parseInt(slice[slice.length - 1].time.slice(11, 13), 10) + 1;
          windows.push({
            startHour: sH,
            endHour: eH,
            avgAqi: avg,
            label: `${fmtHour(sH)}–${fmtHour(eH)}`,
          });
        }
        start = -1;
      }
    }
    if (windows.length > 0) {
      windows.sort((a, b) => a.avgAqi - b.avgAqi);
      return windows.slice(0, 3);
    }
  }
  return [];
}

export function fmtHour(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  const ampm = hh < 12 ? "AM" : "PM";
  const disp = hh % 12 === 0 ? 12 : hh % 12;
  return `${disp}${ampm}`;
}

// ---------------------------------------------------------------------------
// Family sensitivity (shared client/server)
// ---------------------------------------------------------------------------

export interface SensitivityResult {
  score: number; // 0..100, higher = more vulnerable
  band: "low" | "moderate" | "high" | "very-high";
  reasons: string[];
}

const AGE_SCORE: Record<string, number> = { child: 35, teen: 15, adult: 0, senior: 30 };
const CONDITION_SCORES: Record<string, { pts: number; label: string }> = {
  asthma: { pts: 30, label: "Asthma" },
  heart: { pts: 25, label: "Heart condition" },
  copd: { pts: 30, label: "COPD" },
  pregnancy: { pts: 20, label: "Pregnancy" },
  diabetes: { pts: 10, label: "Diabetes" },
  smoker: { pts: 10, label: "Smoker" },
};

export function sensitivityFor(ageGroup: string, conditions: string): SensitivityResult {
  const reasons: string[] = [];
  let score = AGE_SCORE[ageGroup] ?? 0;
  if (score >= 30) {
    reasons.push(ageGroup === "child" ? "Children breathe faster per kg of body weight" : "Seniors have reduced respiratory reserve");
  }
  for (const key of conditions.split(",").map((s) => s.trim()).filter(Boolean)) {
    const c = CONDITION_SCORES[key];
    if (c) {
      score += c.pts;
      reasons.push(c.label);
    }
  }
  score = Math.min(100, score);
  const band: SensitivityResult["band"] =
    score >= 60 ? "very-high" : score >= 35 ? "high" : score >= 15 ? "moderate" : "low";
  return { score, band, reasons };
}

export const SENSITIVITY_BAND_META: Record<SensitivityResult["band"], { label: string; color: string }> = {
  low: { label: "Low sensitivity", color: "#16a34a" },
  moderate: { label: "Moderate sensitivity", color: "#eab308" },
  high: { label: "High sensitivity", color: "#f97316" },
  "very-high": { label: "Very high sensitivity", color: "#ef4444" },
};

/** Short risk verdict for a member given an AQI category. */
export function memberRiskVerdict(band: SensitivityResult["band"], cat: CategoryKey): string {
  const order: CategoryKey[] = ["good", "satisfactory", "moderate", "poor", "very-poor", "severe"];
  const catIdx = order.indexOf(cat);
  if (band === "very-high") {
    return catIdx >= 2 ? "Keep indoors — filter air" : "Short outdoor stints only";
  }
  if (band === "high") {
    return catIdx >= 3 ? "Avoid outdoor exertion" : catIdx >= 2 ? "Limit prolonged outdoor time" : "Cleared for outdoors";
  }
  if (band === "moderate") {
    return catIdx >= 4 ? "Minimise outdoor time" : "Mostly fine — carry a mask";
  }
  return catIdx >= 5 ? "Even healthy lungs should stay in" : "Good to go outside";
}
