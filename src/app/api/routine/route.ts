import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildAqiContext, buildFamilyContext, chatComplete, BASE_SYSTEM_PROMPT } from "@/lib/ai";
import { CITIES } from "@/lib/aqi";

export const maxDuration = 90;

export async function GET() {
  try {
    const routines = await db.routine.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    return NextResponse.json(routines);
  } catch {
    return NextResponse.json({ error: "Failed to load routines" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cityId = CITIES.some((c) => c.id === body.city) ? body.city : "delhi";
    const dayType = ["workday", "weekend", "school-day"].includes(body.dayType)
      ? body.dayType
      : "workday";
    const mode = ["protective", "low-emission", "balanced"].includes(body.mode)
      ? body.mode
      : "balanced";

    const [aqiCtx, familyCtx] = await Promise.all([
      buildAqiContext(cityId),
      buildFamilyContext(),
    ]);

    const modeInstruction: Record<string, string> = {
      protective:
        "Prioritise MINIMISING the family's pollution exposure above everything else (masks, timing, indoor swaps).",
      "low-emission":
        "Prioritise MINIMISING the family's pollution CONTRIBUTION (no idling, metro/cycling/walking choices, combined trips, no burning, efficient cooking).",
      balanced:
        "Balance exposure protection with low-emission living choices.",
    };

    const prompt = `Create a personalised daily smog routine for this family today.

=== LIVE AIR DATA ===
${aqiCtx.text}

=== FAMILY ===
${familyCtx.summary}

=== PLAN SETTINGS ===
Day type: ${dayType}
Focus mode: ${mode} — ${modeInstruction[mode]}

Requirements:
1. Start with one line: today's headline (AQI number + category + the single most important thing).
2. Then a "## Morning" section (wake-up to 9am), "## Midday", "## Evening" and "## Before bed" sections.
3. Each section: 3-5 bullet actions with CONCRETE times (use the best/worst windows from the forecast data), who they matter for (name members), and low-emission commute choices where relevant.
4. Include a "## Watch-outs" line for sensitive members (asthma triggers, symptoms to monitor).
5. Keep the whole plan under 350 words. Markdown only. No preamble like "Sure" — start with the headline.`;

    const content = await chatComplete([
      { role: "assistant", content: BASE_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);

    const routine = await db.routine.create({
      data: {
        city: aqiCtx.cityName,
        aqi: aqiCtx.aqi,
        aqiLabel: aqiCtx.aqiLabel,
        memberSummary:
          familyCtx.count > 0
            ? `Family of ${familyCtx.count}`
            : "No saved members",
        content,
      },
    });

    return NextResponse.json(routine, { status: 201 });
  } catch (err) {
    console.error("routine route error:", err);
    return NextResponse.json(
      { error: "Routine generation failed. Please try again." },
      { status: 502 }
    );
  }
}
