import { NextRequest, NextResponse } from "next/server";
import { buildAqiContext, buildFamilyContext, chatComplete, ChatMessage, BASE_SYSTEM_PROMPT } from "@/lib/ai";
import { CITIES } from "@/lib/aqi";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cityId = CITIES.some((c) => c.id === body.city) ? body.city : "delhi";
    const history: ChatMessage[] = Array.isArray(body.messages)
      ? body.messages
          .filter(
            (m: { role?: string; content?: string }) =>
              m &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string" &&
              m.content.trim().length > 0
          )
          .slice(-12) // keep context tight
          .map((m: { role: "user" | "assistant"; content: string }) => ({
            role: m.role,
            content: m.content.slice(0, 2000),
          }))
      : [];

    if (history.length === 0) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const [aqiCtx, familyCtx] = await Promise.all([
      buildAqiContext(cityId),
      buildFamilyContext(),
    ]);

    const systemPrompt = [
      BASE_SYSTEM_PROMPT,
      `--- LIVE CONTEXT (use these numbers) ---`,
      aqiCtx.text,
      `--- FAMILY PROFILE ---`,
      familyCtx.summary,
    ].join("\n");

    const reply = await chatComplete([
      { role: "assistant", content: systemPrompt },
      ...history,
    ]);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("chat route error:", err);
    return NextResponse.json(
      { error: "The coach is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
