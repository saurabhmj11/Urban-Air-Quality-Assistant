import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatComplete, BASE_SYSTEM_PROMPT } from "@/lib/ai";
import { getAirQuality, snapshotToContextBrief } from "@/lib/air-quality-server";
import { sensitivityFor } from "@/lib/aqi";
import { bestDeparture, fmtDuration, getZone, planCommute } from "@/lib/commute";
import { guardRoute, routeError } from "@/lib/api";
import { commuteRequestSchema } from "@/lib/validation";

export const maxDuration = 60;

/** 12 AI narrations per 5 minutes per IP. */
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, {
    key: "commute",
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
    rateMessage: "Too many commute plans",
    schema: commuteRequestSchema,
  });
  if (!guard.ok) return guard.response;
  const { city, origin, destination, departure, preference } = guard.value;

  const originZone = getZone(city, origin);
  const destinationZone = getZone(city, destination);
  if (!originZone || !destinationZone || originZone.id === destinationZone.id) {
    return NextResponse.json(
      { error: "Pick two different areas inside the selected city." },
      { status: 400 }
    );
  }

  try {
    // --- Live data + family profile ---
    const [snapshot, members] = await Promise.all([
      getAirQuality(city),
      db.familyMember.findMany({ orderBy: { createdAt: "asc" } }),
    ]);

    const currentPm25 =
      snapshot.current.pollutants.find((p) => p.key === "pm25")?.value ?? 0;
    const pick = departure === "best" ? bestDeparture(snapshot.hourly) : null;
    const travelPm25 = pick ? pick.pm25 : currentPm25;

    const sensitiveMembers = members
      .filter((m) => {
        const s = sensitivityFor(m.ageGroup, m.conditions);
        return s.band === "high" || s.band === "very-high";
      })
      .map((m) => m.name);

    // --- Deterministic commute computation (the GenAI layer only narrates) ---
    const result = planCommute({
      originId: origin,
      destinationId: destination,
      pm25: travelPm25,
      aqi: snapshot.current.aqi,
      aqiCategory: snapshot.current.category,
      preference,
      sensitiveMembers,
    });

    if (result.options.length === 0) {
      return NextResponse.json(
        { error: "No feasible route found between these areas." },
        { status: 422 }
      );
    }

    // --- GenAI narration (best-effort; the numbers above are the source of truth) ---
    let narration: string | null = null;
    try {
      const optionsTable = result.options
        .map(
          (o) =>
            `- ${o.label}: ${o.distanceKm} km, ${fmtDuration(o.minutes)}, ` +
            `inhaled PM2.5 ≈ ${Math.round(o.doseMicrograms)} µg, ` +
            `CO2 ≈ ${o.co2Grams} g, trip score ${o.score}/100` +
            (o.badges.length ? ` (${o.badges.join(", ")})` : "") +
            (o.warning ? ` — WARNING: ${o.warning}` : "")
        )
        .join("\n");

      const prompt = `Explain this commute comparison to a family in ${snapshot.city.name}.

=== LIVE AIR ===
${snapshotToContextBrief(snapshot)}

=== TRIP ===
From ${originZone.name} to ${destinationZone.name} (${result.straightKm} km straight-line).
Travel PM2.5 used for exposure: ${Math.round(travelPm25)} µg/m³${pick ? ` (best-window departure at ${pick.time.slice(11, 16)})` : " (current)"}.
Preference: ${preference}.
${sensitiveMembers.length > 0 ? `Sensitive members to protect: ${sensitiveMembers.join(", ")}.` : ""}

=== COMPUTED OPTIONS (use these exact numbers; do NOT invent new ones) ===
${optionsTable}

Requirements:
1. Start with one line naming the recommended mode and why (2 sentences max).
2. "## Why" — 2-3 bullets comparing the recommended mode vs the car on inhaled PM2.5 and CO2, using the numbers above.
3. "## Do this" — 2-3 concrete bullets: departure timing (reference the best window), mask guidance, route tips (metro entry, avoiding arterial roads while cycling, AC recirculate setting).
4. If there are warnings for sensitive members, repeat them prominently.
5. Under 160 words, markdown only, no preamble.`;

      narration = await chatComplete([
        { role: "assistant", content: BASE_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ]);
    } catch (err) {
      // Narration is optional — the deterministic ranking still ships.
      console.error("commute narration failed:", err);
    }

    return NextResponse.json({
      origin: originZone,
      destination: destinationZone,
      straightKm: result.straightKm,
      pm25: travelPm25,
      pm25IsForecast: Boolean(pick),
      bestWindow: pick,
      aqi: snapshot.current.aqi,
      aqiCategory: snapshot.current.category,
      sensitiveMembers,
      options: result.options,
      narration,
    });
  } catch (err) {
    return routeError("commute route", err, "Commute planning failed. Please try again.", 500);
  }
}
