/**
 * Shared GenAI helpers (server-only).
 * Wraps z-ai-web-dev-sdk with a singleton instance, retries and
 * family/AQI context building used by the chat, routine and indoor-plan
 * features.
 */
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { getAirQuality, snapshotToContext } from "@/lib/air-quality-server";
import { sensitivityFor, SENSITIVITY_BAND_META } from "@/lib/aqi";

// Singleton ZAI client stored on globalThis to survive hot reloads.
const globalForZAI = globalThis as unknown as { zaiInstance?: any };

export async function getZAI() {
  if (!globalForZAI.zaiInstance) {
    globalForZAI.zaiInstance = await ZAI.create();
  }
  return globalForZAI.zaiInstance;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Call the LLM with one retry; returns markdown text. */
export async function chatComplete(
  messages: ChatMessage[],
  retries = 1
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const zai = await getZAI();
      const completion = await zai.chat.completions.create({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        thinking: { type: "disabled" },
      });
      const reply = completion?.choices?.[0]?.message?.content;
      if (reply && reply.trim().length > 0) return reply;
      throw new Error("Empty AI response");
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("AI completion failed");
}

export interface FamilyContext {
  summary: string;
  count: number;
}

/** Build a natural-language description of the saved family for prompts. */
export async function buildFamilyContext(): Promise<FamilyContext> {
  const members = await db.familyMember.findMany({ orderBy: { createdAt: "asc" } });
  if (members.length === 0) {
    return { summary: "No family members saved yet (assume a healthy adult).", count: 0 };
  }
  const lines = members.map((m) => {
    const s = sensitivityFor(m.ageGroup, m.conditions);
    const conds = m.conditions
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .join(", ");
    return `- ${m.name}: ${m.ageGroup}${conds ? `, conditions: ${conds}` : ""} → sensitivity ${s.score}/100 (${SENSITIVITY_BAND_META[s.band].label})`;
  });
  return { summary: `Family members:\n${lines.join("\n")}`, count: members.length };
}

/** Build the live AQI context string for a city. */
export async function buildAqiContext(cityId: string): Promise<{
  text: string;
  aqi: number;
  aqiLabel: string;
  cityName: string;
}> {
  const snap = await getAirQuality(cityId);
  const { CATEGORY_INFO } = await import("@/lib/aqi");
  return {
    text: snapshotToContext(snap),
    aqi: snap.current.aqi,
    aqiLabel: CATEGORY_INFO[snap.current.category].label,
    cityName: snap.city.name,
  };
}

export const BASE_SYSTEM_PROMPT = `You are "BreathEasy Coach", a warm, practical urban air-quality assistant for families dealing with severe winter smog (Indian cities context).

Core behaviour:
- You receive LIVE air-quality data and a family profile as context. Use those numbers explicitly in your advice.
- Advice must be concrete and actionable: exact times of day, durations, masks (N95/FFP2), room-level actions, DIY low-cost hacks (wet mopping, cross-ventilation timing, exhaust fan use, CAZ box / fan+HEPA DIY purifier), school-run timing, commute mode choices.
- Favour LOW-EMISSION routines: walking/cycling/metro/carpool timing, avoiding idling, indoor exercise alternatives — help the family reduce both their exposure AND their contribution to smog.
- When air is bad, be honest and safety-first: recommend staying indoors, masks outdoors, purifiers, and sealing leakage paths.
- Keep responses compact: short intro sentence, then markdown bullets or a compact structure. Use bold sparingly for key actions and numbers. Never invent numbers not present in the context or universally known health guidance.
- If asked something unrelated to air quality, health, smog or routines, politely steer back.
- Write in clear, simple English (an Indian family audience). Use metric units.`;
