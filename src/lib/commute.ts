/**
 * Commute planner domain logic for BreathEasy.
 *
 * Ranks door-to-door travel options for an intra-city trip by
 * (a) inhaled PM2.5 dose during the trip (exposure) and
 * (b) CO2e emissions per passenger (contribution),
 * balanced against trip duration according to the user's preference.
 *
 * Pure functions only — safe to import from both client and server code,
 * fully deterministic and unit-tested in commute.test.ts.
 */

import type { CategoryKey, CityInfo } from "@/lib/aqi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TravelMode =
  | "walk"
  | "cycle"
  | "metro"
  | "bus"
  | "auto"
  | "scooter"
  | "car"
  | "carpool";

export type CommutePreference = "protect" | "low-emission" | "balanced";

export interface Zone {
  id: string;
  name: string;
  lat: number;
  lon: number;
  metro: boolean; // whether a metro station serves this zone
}

export interface ModeProfile {
  key: TravelMode;
  label: string;
  /** Door-to-door effective speed in Indian city traffic (km/h). */
  speedKmh: number;
  /** Route distance multiplier over the straight-line distance. */
  detour: number;
  /** Fixed overhead: access, wait, parking, pickups (minutes). */
  accessMin: number;
  /** Typical well-to-wheel CO2e per passenger-km (grams). */
  co2PerKm: number;
  /** Ratio of in-journey PM2.5 to ambient city PM2.5 (micro-environment). */
  microEnv: number;
  /** Breathing ventilation rate while travelling (L/min, adult). */
  ventLPerMin: number;
  /** Practical door-to-door distance cap (km). */
  maxKm: number;
}

export interface CommuteOption {
  mode: TravelMode;
  label: string;
  distanceKm: number;
  minutes: number;
  /** CO2e for this trip per passenger (grams). */
  co2Grams: number;
  /** Estimated PM2.5 mass inhaled during the trip (µg). */
  doseMicrograms: number;
  /** 0–100 trip score — higher is better for the chosen preference. */
  score: number;
  badges: string[];
  /** Practicality note for sensitive travellers, if any. */
  warning: string | null;
}

export interface CommuteInput {
  originId: string;
  destinationId: string;
  /** Ambient PM2.5 at travel time (µg/m³). */
  pm25: number;
  /** AQI number + category for display/context. */
  aqi: number;
  aqiCategory: CategoryKey;
  preference: CommutePreference;
  /** Names of family members with high or very-high sensitivity. */
  sensitiveMembers: string[];
}

export interface CommuteResult {
  options: CommuteOption[]; // sorted best-first
  straightKm: number;
  feasibleCount: number;
}

// ---------------------------------------------------------------------------
// Mode profiles
// ---------------------------------------------------------------------------
// Micro-environment and CO2e figures are typical published values for Indian
// cities (CPCB / CEA / transport studies), rounded for communication.
// Car assumes windows up with AC recirculation; carpool divides by 3 occupants.

export const MODES: ModeProfile[] = [
  { key: "walk",    label: "Walk",          speedKmh: 4.8, detour: 1.25, accessMin: 0,  co2PerKm: 0,   microEnv: 1.15, ventLPerMin: 20, maxKm: 4 },
  { key: "cycle",   label: "Cycle",         speedKmh: 12,  detour: 1.25, accessMin: 2,  co2PerKm: 0,   microEnv: 1.15, ventLPerMin: 40, maxKm: 10 },
  { key: "metro",   label: "Metro",         speedKmh: 32,  detour: 1.5,  accessMin: 12, co2PerKm: 30,  microEnv: 0.55, ventLPerMin: 12, maxKm: 40 },
  { key: "bus",     label: "Bus",           speedKmh: 16,  detour: 1.4,  accessMin: 8,  co2PerKm: 80,  microEnv: 0.7,  ventLPerMin: 12, maxKm: 40 },
  { key: "auto",    label: "Auto-rickshaw", speedKmh: 18,  detour: 1.3,  accessMin: 4,  co2PerKm: 45,  microEnv: 0.95, ventLPerMin: 12, maxKm: 15 },
  { key: "scooter", label: "Scooter",       speedKmh: 22,  detour: 1.3,  accessMin: 2,  co2PerKm: 70,  microEnv: 1.1,  ventLPerMin: 20, maxKm: 25 },
  { key: "car",     label: "Car (solo)",    speedKmh: 24,  detour: 1.35, accessMin: 6,  co2PerKm: 180, microEnv: 0.4,  ventLPerMin: 12, maxKm: 60 },
  { key: "carpool", label: "Carpool",       speedKmh: 24,  detour: 1.4,  accessMin: 8,  co2PerKm: 65,  microEnv: 0.4,  ventLPerMin: 12, maxKm: 60 },
];

export const MODE_BY_KEY: Record<TravelMode, ModeProfile> = MODES.reduce(
  (acc, m) => ({ ...acc, [m.key]: m }),
  {} as Record<TravelMode, ModeProfile>
);

/** Preference weights over (dose, co2, duration). Each row sums to 1. */
export const PREFERENCE_WEIGHTS: Record<
  CommutePreference,
  { dose: number; co2: number; time: number }
> = {
  protect:      { dose: 0.55, co2: 0.20, time: 0.25 },
  "low-emission": { dose: 0.20, co2: 0.60, time: 0.20 },
  balanced:     { dose: 0.40, co2: 0.35, time: 0.25 },
};

/** PM2.5 (µg/m³) above which active modes are flagged for sensitive members. */
const SENSITIVE_ACTIVE_PM25_LIMIT = 60;

// ---------------------------------------------------------------------------
// Zone catalogue (approximate locality coordinates, ~1 km accuracy)
// ---------------------------------------------------------------------------

export const ZONES: Record<string, Zone[]> = {
  delhi: [
    { id: "delhi-cp", name: "Connaught Place", lat: 28.6315, lon: 77.2167, metro: true },
    { id: "delhi-dwarka", name: "Dwarka", lat: 28.5921, lon: 77.046, metro: true },
    { id: "delhi-rohini", name: "Rohini", lat: 28.7495, lon: 77.0565, metro: true },
    { id: "delhi-saket", name: "Saket", lat: 28.5245, lon: 77.2066, metro: true },
    { id: "delhi-laxmi", name: "Laxmi Nagar", lat: 28.6365, lon: 77.2775, metro: true },
    { id: "delhi-aerocity", name: "Aerocity", lat: 28.5485, lon: 77.12, metro: true },
  ],
  gurugram: [
    { id: "ggn-sec29", name: "Sector 29", lat: 28.4673, lon: 77.0699, metro: false },
    { id: "ggn-cyber", name: "Cyber City", lat: 28.4956, lon: 77.0894, metro: true },
    { id: "ggn-golf", name: "Golf Course Road", lat: 28.4595, lon: 77.0999, metro: true },
    { id: "ggn-sohna", name: "Sohna Road", lat: 28.4173, lon: 77.0371, metro: false },
    { id: "ggn-old", name: "Old Gurgaon", lat: 28.3937, lon: 76.955, metro: true },
    { id: "ggn-sec56", name: "Sector 56", lat: 28.4224, lon: 77.101, metro: true },
  ],
  noida: [
    { id: "noida-sec62", name: "Sector 62", lat: 28.6272, lon: 77.372, metro: true },
    { id: "noida-sec18", name: "Sector 18 (Atta)", lat: 28.5706, lon: 77.3266, metro: true },
    { id: "noida-sec128", name: "Sector 128", lat: 28.4745, lon: 77.3265, metro: false },
    { id: "noida-gn", name: "Greater Noida", lat: 28.4744, lon: 77.504, metro: false },
    { id: "noida-sec44", name: "Sector 44", lat: 28.5512, lon: 77.325, metro: true },
    { id: "noida-ext", name: "Noida Extension", lat: 28.5355, lon: 77.39, metro: false },
  ],
  mumbai: [
    { id: "mum-colaba", name: "Colaba", lat: 18.9067, lon: 72.8147, metro: true },
    { id: "mum-andheri", name: "Andheri", lat: 19.1364, lon: 72.8296, metro: true },
    { id: "mum-bandra", name: "Bandra", lat: 19.076, lon: 72.8777, metro: true },
    { id: "mum-dadar", name: "Dadar", lat: 19.0178, lon: 72.8478, metro: true },
    { id: "mum-powai", name: "Powai", lat: 19.1176, lon: 72.906, metro: false },
    { id: "mum-thane", name: "Thane", lat: 19.2183, lon: 72.9781, metro: true },
  ],
  kolkata: [
    { id: "kol-parkst", name: "Park Street", lat: 22.5535, lon: 88.352, metro: true },
    { id: "kol-saltlake", name: "Salt Lake", lat: 22.5867, lon: 88.4171, metro: true },
    { id: "kol-howrah", name: "Howrah", lat: 22.5958, lon: 88.2636, metro: false },
    { id: "kol-behala", name: "Behala", lat: 22.4989, lon: 88.3103, metro: true },
    { id: "kol-newtown", name: "New Town", lat: 22.58, lon: 88.46, metro: true },
    { id: "kol-dumdum", name: "Dum Dum", lat: 22.642, lon: 88.423, metro: true },
  ],
  bengaluru: [
    { id: "blr-mg", name: "MG Road", lat: 12.9757, lon: 77.6068, metro: true },
    { id: "blr-whitefield", name: "Whitefield", lat: 12.9698, lon: 77.75, metro: true },
    { id: "blr-ecity", name: "Electronic City", lat: 12.8452, lon: 77.6602, metro: false },
    { id: "blr-koramangala", name: "Koramangala", lat: 12.9352, lon: 77.6245, metro: false },
    { id: "blr-jayanagar", name: "Jayanagar", lat: 12.925, lon: 77.5938, metro: true },
    { id: "blr-yelahanka", name: "Yelahanka", lat: 13.1007, lon: 77.5963, metro: false },
  ],
  chennai: [
    { id: "che-tnagar", name: "T. Nagar", lat: 13.0418, lon: 80.2341, metro: true },
    { id: "che-adyar", name: "Adyar", lat: 13.0063, lon: 80.2574, metro: false },
    { id: "che-velachery", name: "Velachery", lat: 12.9791, lon: 80.221, metro: true },
    { id: "che-guindy", name: "Guindy", lat: 13.0067, lon: 80.2206, metro: true },
    { id: "che-tambaram", name: "Tambaram", lat: 12.9249, lon: 80.1, metro: false },
    { id: "che-annanagar", name: "Anna Nagar", lat: 13.0878, lon: 80.2107, metro: true },
  ],
  hyderabad: [
    { id: "hyd-banjara", name: "Banjara Hills", lat: 17.4126, lon: 78.4362, metro: false },
    { id: "hyd-hitec", name: "HITEC City", lat: 17.4435, lon: 78.3772, metro: true },
    { id: "hyd-secunderabad", name: "Secunderabad", lat: 17.4399, lon: 78.4983, metro: true },
    { id: "hyd-oldcity", name: "Old City (Charminar)", lat: 17.3616, lon: 78.4747, metro: false },
    { id: "hyd-gachibowli", name: "Gachibowli", lat: 17.4401, lon: 78.3489, metro: false },
    { id: "hyd-kukatpally", name: "Kukatpally", lat: 17.4849, lon: 78.4138, metro: true },
  ],
  pune: [
    { id: "pun-shivaji", name: "Shivajinagar", lat: 18.5308, lon: 73.8475, metro: false },
    { id: "pun-hinjewadi", name: "Hinjewadi", lat: 18.5913, lon: 73.7389, metro: true },
    { id: "pun-kothrud", name: "Kothrud", lat: 18.5074, lon: 73.8077, metro: false },
    { id: "pun-viman", name: "Viman Nagar", lat: 18.5679, lon: 73.9143, metro: false },
    { id: "pun-hadapsar", name: "Hadapsar", lat: 18.501, lon: 73.9264, metro: false },
    { id: "pun-pimpri", name: "Pimpri-Chinchwad", lat: 18.6298, lon: 73.7997, metro: true },
  ],
  jaipur: [
    { id: "jai-cscheme", name: "C-Scheme", lat: 26.908, lon: 75.798, metro: false },
    { id: "jai-malviya", name: "Malviya Nagar", lat: 26.856, lon: 75.812, metro: true },
    { id: "jai-vaishali", name: "Vaishali Nagar", lat: 26.912, lon: 75.739, metro: false },
    { id: "jai-mansarovar", name: "Mansarovar", lat: 26.85, lon: 75.76, metro: true },
    { id: "jai-jagatpura", name: "Jagatpura", lat: 26.82, lon: 75.84, metro: false },
    { id: "jai-sitapura", name: "Sitapura", lat: 26.769, lon: 75.835, metro: false },
  ],
  lucknow: [
    { id: "lko-hazratganj", name: "Hazratganj", lat: 26.847, lon: 80.947, metro: false },
    { id: "lko-gomti", name: "Gomti Nagar", lat: 26.849, lon: 81.0, metro: true },
    { id: "lko-aliganj", name: "Aliganj", lat: 26.885, lon: 80.945, metro: false },
    { id: "lko-indira", name: "Indira Nagar", lat: 26.875, lon: 80.99, metro: true },
    { id: "lko-aashiyana", name: "Aashiyana", lat: 26.79, lon: 80.915, metro: false },
    { id: "lko-chinhat", name: "Chinhat", lat: 26.88, lon: 81.03, metro: false },
  ],
  kanpur: [
    { id: "knr-civil", name: "Civil Lines", lat: 26.461, lon: 80.35, metro: true },
    { id: "knr-mall", name: "Mall Road", lat: 26.464, lon: 80.346, metro: true },
    { id: "knr-govind", name: "Govind Nagar", lat: 26.437, lon: 80.318, metro: false },
    { id: "knr-swaroop", name: "Swaroop Nagar", lat: 26.475, lon: 80.33, metro: false },
    { id: "knr-panki", name: "Panki", lat: 26.48, lon: 80.24, metro: false },
    { id: "knr-iit", name: "IIT Kanpur", lat: 26.519, lon: 80.232, metro: false },
  ],
};

export function getZones(cityId: string): Zone[] {
  return ZONES[cityId] ?? ZONES.delhi;
}

export function getZone(cityId: string, zoneId: string): Zone | null {
  return getZones(cityId).find((z) => z.id === zoneId) ?? null;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two coordinates (km). */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

// ---------------------------------------------------------------------------
// Exposure model
// ---------------------------------------------------------------------------

/**
 * PM2.5 mass inhaled during a trip (µg).
 *
 * dose = ambient PM2.5 (µg/m³) × micro-environment ratio ×
 *        ventilation (m³/min) × duration (min)
 */
export function inhaledDoseMicrograms(
  pm25: number,
  mode: ModeProfile,
  minutes: number
): number {
  if (pm25 <= 0 || minutes <= 0) return 0;
  const m3PerMin = mode.ventLPerMin / 1000;
  return Math.round(pm25 * mode.microEnv * m3PerMin * minutes * 10) / 10;
}

/** CO2e for the trip per passenger (grams). */
export function tripCo2Grams(mode: ModeProfile, distanceKm: number): number {
  return Math.round(mode.co2PerKm * distanceKm);
}

// ---------------------------------------------------------------------------
// Option builder
// ---------------------------------------------------------------------------

function modeAvailable(
  mode: ModeProfile,
  straightKm: number,
  origin: Zone,
  destination: Zone
): boolean {
  if (origin.id === destination.id && mode.key !== "walk") return false;
  const routeKm = straightKm * mode.detour;
  if (routeKm > mode.maxKm) return false;
  if (mode.key === "metro" && !(origin.metro && destination.metro)) return false;
  return true;
}

/**
 * Build and rank commute options for a trip.
 *
 * Every option gets a 0–100 score built from min-max normalised dose,
 * CO2e and duration, weighted by the user's preference. Options are
 * returned best-first; badges mark the cleanest-air, lowest-emission
 * and fastest options.
 */
export function planCommute(input: CommuteInput): CommuteResult {
  const origin = findZoneAnywhere(input.originId);
  const destination = findZoneAnywhere(input.destinationId);
  if (!origin || !destination) {
    return { options: [], straightKm: 0, feasibleCount: 0 };
  }

  const straightKm = Math.max(
    0.3,
    Math.round(haversineKm(origin, destination) * 10) / 10
  );

  const built = MODES.filter((m) =>
    modeAvailable(m, straightKm, origin, destination)
  ).map((m) => {
    const distanceKm = Math.round(straightKm * m.detour * 10) / 10;
    const travelMin = (distanceKm / m.speedKmh) * 60;
    const minutes = Math.max(1, Math.round(travelMin + m.accessMin));
    const dose = inhaledDoseMicrograms(input.pm25, m, minutes);
    const co2 = tripCo2Grams(m, distanceKm);
    return { mode: m, distanceKm, minutes, dose, co2 };
  });

  if (built.length === 0) {
    return { options: [], straightKm, feasibleCount: 0 };
  }

  // Min-max normalisation across the feasible set (0 = best on that axis,
  // 1 = worst). When all options tie on an axis, it contributes no penalty.
  const minMax = (vals: number[]) => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return (v: number) => (max === min ? 0 : (v - min) / (max - min));
  };
  const normDose = minMax(built.map((b) => b.dose));
  const normCo2 = minMax(built.map((b) => b.co2));
  const normTime = minMax(built.map((b) => b.minutes));
  const w = PREFERENCE_WEIGHTS[input.preference];

  const scored = built.map((b) => {
    const penalty =
      w.dose * normDose(b.dose) + w.co2 * normCo2(b.co2) + w.time * normTime(b.minutes);
    return { ...b, score: Math.round(100 * (1 - penalty)) };
  });

  scored.sort((a, b) => b.score - a.score);

  // Badges for the extremes (independent of preference).
  const cleanest = scored.reduce((best, o) => (o.dose < best.dose ? o : best), scored[0]);
  const greenest = scored.reduce((best, o) => (o.co2 < best.co2 ? o : best), scored[0]);
  const fastest = scored.reduce((best, o) => (o.minutes < best.minutes ? o : best), scored[0]);

  const sensitive = input.sensitiveMembers.length > 0;
  const names = input.sensitiveMembers.join(", ");

  const options: CommuteOption[] = scored.map((o) => {
    const badges: string[] = [];
    if (o.mode.key === cleanest.mode.key) badges.push("Cleanest air");
    if (o.mode.key === greenest.mode.key) badges.push("Lowest emission");
    if (o.mode.key === fastest.mode.key) badges.push("Fastest");

    let warning: string | null = null;
    if (
      sensitive &&
      (o.mode.key === "walk" || o.mode.key === "cycle" || o.mode.key === "scooter") &&
      input.pm25 > SENSITIVE_ACTIVE_PM25_LIMIT
    ) {
      warning = `PM2.5 is ${Math.round(input.pm25)} µg/m³ — not advised for ${names} (N95 mask if unavoidable)`;
    }
    if (sensitive && o.mode.key === "auto" && input.pm25 > 150) {
      warning = `Open-sided auto offers little filtering — carry N95 masks for ${names}`;
    }

    return {
      mode: o.mode.key,
      label: o.mode.label,
      distanceKm: o.distanceKm,
      minutes: o.minutes,
      co2Grams: o.co2,
      doseMicrograms: o.dose,
      score: o.score,
      badges,
      warning,
    };
  });

  return { options, straightKm, feasibleCount: options.length };
}

/** Zone lookup that does not require the city id (zone ids are globally unique). */
function findZoneAnywhere(zoneId: string): Zone | null {
  for (const list of Object.values(ZONES)) {
    const hit = list.find((z) => z.id === zoneId);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Best departure finder (from hourly forecast)
// ---------------------------------------------------------------------------

export interface DeparturePick {
  time: string; // ISO local
  pm25: number;
}

/**
 * Pick the departure hour with the lowest forecast PM2.5 among the next
 * `hours` future points. Returns null when no forecast is available.
 */
export function bestDeparture(
  hourly: { time: string; pm25: number; future: boolean }[],
  hours = 8
): DeparturePick | null {
  const future = hourly.filter((p) => p.future).slice(0, hours);
  if (future.length === 0) return null;
  return future.reduce((best, p) => (p.pm25 < best.pm25 ? p : best));
}

/** Format a duration in minutes for display ("1 h 20 min" / "45 min"). */
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
