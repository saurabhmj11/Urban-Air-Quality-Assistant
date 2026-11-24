import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAqiContext, chatComplete, BASE_SYSTEM_PROMPT } from "@/lib/ai";
import { guardRoute, routeError } from "@/lib/api";
import { indoorPlanRequestSchema } from "@/lib/validation";

export const maxDuration = 90;

/** 6 indoor plans per 5 minutes per IP. */
const RATE_LIMIT = 6;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, {
    key: "indoor",
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
    rateMessage: "Slow down a little",
    schema: indoorPlanRequestSchema,
  });
  if (!guard.ok) return guard.response;
  const { city, rooms, hasPurifier, hasAC, budget, cooking, notes } = guard.value;

  try {
    const aqiCtx = await buildAqiContext(city);

    const budgetText: Record<string, string> = {
      zero: "₹0 — only free behaviour changes (ventilation timing, wet mopping, sealing with cloth/tape)",
      low: "under ₹2,000 — low-cost gear (N95 masks, basic exhaust use, DIY CAZ box with a 20-inch fan + MERV filters)",
      mid: "under ₹15,000 — a budget HEPA purifier for the bedroom plus low-cost gear for other rooms",
      high: "under ₹50,000 — purifiers for main rooms, professional-grade filtration",
    };
    const cookingText: Record<string, string> = {
      gas: "LPG/piped gas stove",
      electric: "electric coil/hot plate",
      induction: "induction cooktop",
      "wood-or-biomass": "wood/biomass chulha (major indoor PM source)",
    };

    const prompt = `Design a room-by-room indoor air protection plan for this home today.

=== LIVE OUTDOOR AIR ===
${aqiCtx.text}

=== HOME ===
- Rooms: ${rooms}
- Air purifier already owned: ${hasPurifier ? "yes" : "no"}
- Air conditioning: ${hasAC ? "yes" : "no"}
- Cooking: ${cookingText[cooking]}
- Budget: ${budgetText[budget]}
${notes ? `- Extra notes: ${notes}` : ""}

Requirements:
1. One-line headline: today's indoor game plan given the outdoor AQI.
2. "## Right now (today)" — 4-6 immediate actions: window/ventilation timing based on the forecast windows, exhaust fan use while cooking, wet mopping, door discipline, purifier placement if owned.
3. "## Room-by-room" — one bullet per room type (bedroom, kitchen, living room) with the single highest-impact action.
4. "## This week" — 2-3 purchases or DIY builds within budget (name exact items and rough ₹ prices where relevant; a DIY fan+filter "CAZ box" is a great zero/low-budget mention).
5. "## Kitchen smoke rules" — 3 bullets tailored to their cooking fuel.
6. Keep under 320 words, markdown only, no preamble.`;

    const content = await chatComplete([
      { role: "assistant", content: BASE_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);

    const plan = await db.indoorPlan.create({
      data: {
        city: aqiCtx.cityName,
        aqi: aqiCtx.aqi,
        homeInfo: `${rooms} rooms · ${cookingText[cooking]} · budget ${budget}`,
        content,
      },
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (err) {
    return routeError("indoor-plan route", err, "Indoor plan generation failed. Please try again.");
  }
}
