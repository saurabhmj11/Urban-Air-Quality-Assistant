import { NextRequest, NextResponse } from "next/server";
import { buildAqiContext, buildFamilyContext, chatComplete, BASE_SYSTEM_PROMPT } from "@/lib/ai";
import { guardRoute, routeError } from "@/lib/api";
import { chatRequestSchema } from "@/lib/validation";

export const maxDuration = 60;

/** 20 coach messages per 5 minutes per IP. */
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, {
    key: "chat",
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
    rateMessage: "The coach needs a breather",
    schema: chatRequestSchema,
  });
  if (!guard.ok) return guard.response;
  const { city, messages } = guard.value;

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
    return routeError("chat route", err, "The coach is temporarily unavailable. Please try again.");
  }
}
