import { NextRequest, NextResponse } from "next/server";
import { buildAqiContext, buildFamilyContext, chatComplete, ChatMessage, BASE_SYSTEM_PROMPT } from "@/lib/ai";
import { chatRequestSchema, parseBody } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

/** 20 coach messages per 5 minutes per IP. */
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  // --- Rate limit ---
  const rl = rateLimit(`chat:${clientIp(req.headers)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `The coach needs a breather. Try again in ${rl.resetInSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.resetInSec) } }
    );
  }

  // --- Validate ---
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseBody(chatRequestSchema, raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { city, messages } = parsed.value;

  try {
    const [aqiCtx, familyCtx] = await Promise.all([
      buildAqiContext(city),
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
      ...messages,
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
