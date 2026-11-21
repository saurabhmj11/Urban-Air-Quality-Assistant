/**
 * Server-side air-quality service.
 *
 * Fetches live pollutant data from the free Open-Meteo Air Quality API,
 * converts it to the CPCB National AQI scale, caches per city for 10 minutes,
 * and falls back to a deterministic winter-smog simulation when the network
 * is unavailable so the app always renders useful data.
 */
import net from "node:net";
import {
  AirQualitySnapshot,
  CATEGORY_INFO,
  CityInfo,
  HourlyPoint,
  PollutantKey,
  PollutantReading,
  categoryOf,
  findBestWindows,
  getCity,
  simulateCurrentPollutants,
  simulateHourlyPm25,
  subIndex,
  POLLUTANT_META,
} from "@/lib/aqi";

const CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_TTL_MS = 60 * 1000; // retry live data sooner after a failure

// Node >= 23 disables Happy Eyeballs by default; without an IPv6 route,
// fetch to dual-stack hosts (Open-Meteo) fails with ETIMEDOUT. Re-enable it.
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(true);
}

const cache = new Map<string, { at: number; ttl: number; data: AirQualitySnapshot }>();

interface OpenMeteoResponse {
  current?: {
    time: string;
    pm2_5?: number;
    pm10?: number;
    nitrogen_dioxide?: number;
    sulphur_dioxide?: number;
    ozone?: number;
    carbon_monoxide?: number; // µg/m³
  };
  hourly?: {
    time: string[];
    pm2_5: (number | null)[];
  };
}

async function fetchOnce(url: string): Promise<OpenMeteoResponse | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.error(`[air-quality] Open-Meteo HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as OpenMeteoResponse;
    if (!json.current || !json.hourly || !Array.isArray(json.hourly.pm2_5)) {
      console.error("[air-quality] Open-Meteo payload incomplete");
      return null;
    }
    return json;
  } catch (err) {
    console.error("[air-quality] Open-Meteo fetch failed:", err);
    return null;
  }
}

async function fetchOpenMeteo(city: CityInfo): Promise<OpenMeteoResponse | null> {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${city.lat}&longitude=${city.lon}` +
    `&current=pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide` +
    `&hourly=pm2_5&past_days=1&forecast_days=2&timezone=auto`;
  // One retry to ride out transient network blips.
  return (await fetchOnce(url)) ?? (await fetchOnce(url));
}

function buildPollutants(raw: Partial<Record<PollutantKey, number>>): PollutantReading[] {
  const order: PollutantKey[] = ["pm25", "pm10", "no2", "so2", "o3", "co"];
  return order
    .filter((k) => typeof raw[k] === "number" && isFinite(raw[k] as number))
    .map((k) => {
      const value = raw[k] as number;
      const si = subIndex(k, value);
      return {
        key: k,
        name: POLLUTANT_META[k].name,
        value: Math.round(value * 10) / 10,
        unit: POLLUTANT_META[k].unit,
        subIndex: si,
        category: categoryOf(si),
        inOverall: POLLUTANT_META[k].inOverall,
      };
    });
}

function buildSnapshot(
  city: CityInfo,
  source: "open-meteo" | "simulated",
  pollutants: PollutantReading[],
  hourly: HourlyPoint[]
): AirQualitySnapshot {
  // Overall AQI is driven by 24h-standard pollutants (PM + NO2 + SO2).
  // O3/CO are displayed for information but excluded from the headline
  // number because the live feed's instantaneous values would overstate
  // their 8-hour CPCB metrics.
  const drivers = pollutants.filter((p) => p.inOverall);
  const overall = drivers.reduce(
    (best, p) => (p.subIndex > best.subIndex ? p : best),
    drivers[0]
  );
  const future = hourly.filter((p) => p.future).slice(0, 24);
  const past = hourly.filter((p) => !p.future).slice(-24);
  return {
    city,
    source,
    updatedAt: new Date().toISOString(),
    current: {
      aqi: overall?.subIndex ?? 0,
      category: categoryOf(overall?.subIndex ?? 0),
      dominant: overall?.key ?? "pm25",
      pollutants,
    },
    hourly: [...past, ...future],
    bestWindows: findBestWindows(hourly),
  };
}

export async function getAirQuality(cityId: string): Promise<AirQualitySnapshot> {
  const city = getCity(cityId);
  const hit = cache.get(city.id);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data;

  const raw = await fetchOpenMeteo(city);

  let snapshot: AirQualitySnapshot;
  if (raw) {
    // Open-Meteo returns CO in µg/m³; CPCB uses mg/m³.
    const cur = raw.current!;
    const pm25Now = cur.pm2_5 ?? 0;
    const pollutants = buildPollutants({
      pm25: pm25Now,
      pm10: cur.pm10 ?? pm25Now * 1.1,
      no2: cur.nitrogen_dioxide ?? 20,
      so2: cur.sulphur_dioxide ?? 10,
      o3: cur.ozone ?? 30,
      co: (cur.carbon_monoxide ?? 500) / 1000,
    });

    const nowKey = (cur.time ?? "").slice(0, 13); // "YYYY-MM-DDTHH"
    const hours = raw.hourly!;
    const allHourly: HourlyPoint[] = [];
    for (let i = 0; i < hours.time.length; i++) {
      const t = hours.time[i];
      const pm = hours.pm2_5[i];
      if (pm == null || !isFinite(pm)) continue;
      const si = subIndex("pm25", pm);
      const tKey = t.slice(0, 13);
      allHourly.push({
        time: t,
        pm25: Math.round(pm * 10) / 10,
        aqi: si,
        category: categoryOf(si),
        future: tKey > nowKey,
      });
    }
    // Trim: last 24 past points + next 24 future points
    const past = allHourly.filter((p) => !p.future).slice(-24);
    const futurePts = allHourly.filter((p) => p.future).slice(0, 24);
    snapshot = buildSnapshot(city, "open-meteo", pollutants, [...past, ...futurePts]);
  } else {
    // ----- Deterministic fallback simulation -----
    const sim = simulateHourlyPm25(city.id, new Date(Date.now() - 24 * 3600_000), 49);
    const hourly: HourlyPoint[] = sim.map((h, idx) => {
      const si = subIndex("pm25", h.pm25);
      return {
        time: h.time,
        pm25: h.pm25,
        aqi: si,
        category: categoryOf(si),
        future: idx >= 24,
      };
    });
    const curPm25 = hourly[24]?.pm25 ?? 90;
    const simPoll = simulateCurrentPollutants(city.id, curPm25);
    const pollutants = buildPollutants(simPoll);
    snapshot = buildSnapshot(city, "simulated", pollutants, hourly);
  }

  cache.set(city.id, {
    at: Date.now(),
    ttl: snapshot.source === "open-meteo" ? CACHE_TTL_MS : FALLBACK_TTL_MS,
    data: snapshot,
  });
  return snapshot;
}

/** Compact text summary of a snapshot — injected into GenAI prompts. */
export function snapshotToContext(s: AirQualitySnapshot): string {
  const cat = CATEGORY_INFO[s.current.category];
  const poll = s.current.pollutants
    .map((p) => `${p.name} ${p.value}${p.unit} (sub-AQI ${p.subIndex})`)
    .join("; ");
  const trend = s.hourly
    .filter((p) => p.future)
    .slice(0, 12)
    .map((p) => `${p.time.slice(11, 16)}=${p.aqi}`)
    .join(", ");
  const windows = s.bestWindows.map((w) => w.label).join(", ") || "none — air stays bad all day";
  return [
    `City: ${s.city.name} (${s.city.state}), data source: ${s.source}, updated ${s.updatedAt}`,
    `Current AQI: ${s.current.aqi} (${cat.label}); dominant pollutant ${s.current.dominant}`,
    `Readings: ${poll}`,
    `Next 12h PM2.5-AQI forecast: ${trend}`,
    `Best outdoor windows today: ${windows}`,
  ].join("\n");
}
