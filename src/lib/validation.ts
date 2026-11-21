/**
 * Request-body validation schemas (shared by API routes).
 *
 * Every POST body is parsed with zod before touching the database or the
 * LLM — malformed or oversized payloads are rejected with 400 and a
 * human-readable message instead of being coerced.
 */
import { z } from "zod";

/** City ids, kept in sync with CITIES in lib/aqi.ts (asserted by tests). */
export const CITY_IDS = [
  "delhi",
  "gurugram",
  "noida",
  "mumbai",
  "kolkata",
  "bengaluru",
  "chennai",
  "hyderabad",
  "pune",
  "jaipur",
  "lucknow",
  "kanpur",
] as const;

export type CityId = (typeof CITY_IDS)[number];

export const cityIdSchema = z.enum(CITY_IDS);

// ---------------------------------------------------------------------------
// AI Coach chat
// ---------------------------------------------------------------------------

export const chatRequestSchema = z.object({
  city: cityIdSchema,
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(12),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ---------------------------------------------------------------------------
// Routine generator
// ---------------------------------------------------------------------------

export const routineRequestSchema = z.object({
  city: cityIdSchema,
  dayType: z.enum(["workday", "weekend", "school-day"]),
  mode: z.enum(["protective", "low-emission", "balanced"]),
});

export type RoutineRequest = z.infer<typeof routineRequestSchema>;

// ---------------------------------------------------------------------------
// Indoor plan
// ---------------------------------------------------------------------------

export const indoorPlanRequestSchema = z.object({
  city: cityIdSchema,
  rooms: z.number().int().min(1).max(10),
  hasPurifier: z.boolean(),
  hasAC: z.boolean(),
  budget: z.enum(["zero", "low", "mid", "high"]),
  cooking: z.enum(["gas", "electric", "induction", "wood-or-biomass"]),
  notes: z.string().max(300).optional(),
});

export type IndoorPlanRequest = z.infer<typeof indoorPlanRequestSchema>;

// ---------------------------------------------------------------------------
// Commute planner
// ---------------------------------------------------------------------------

export const commuteRequestSchema = z.object({
  city: cityIdSchema,
  origin: z.string().min(1).max(40),
  destination: z.string().min(1).max(40),
  departure: z.enum(["now", "best"]),
  preference: z.enum(["protect", "low-emission", "balanced"]),
});

export type CommuteRequest = z.infer<typeof commuteRequestSchema>;

// ---------------------------------------------------------------------------
// Family members
// ---------------------------------------------------------------------------

export const AGE_GROUPS = ["child", "teen", "adult", "senior"] as const;
export const CONDITIONS = [
  "asthma",
  "heart",
  "copd",
  "pregnancy",
  "diabetes",
  "smoker",
] as const;

export const memberCreateSchema = z.object({
  name: z.string().min(1).max(40),
  ageGroup: z.enum(AGE_GROUPS),
  conditions: z.array(z.enum(CONDITIONS)).max(6).optional(),
});

export type MemberCreateRequest = z.infer<typeof memberCreateSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSON request body against a schema.
 * Returns a typed result without throwing.
 */
export function parseBody<T extends z.ZodType>(
  schema: T,
  data: unknown
): { ok: true; value: z.infer<T> } | { ok: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const first = result.error.issues[0];
  const path = first?.path?.length ? `at "${first.path.join(".")}"` : "";
  return {
    ok: false,
    error: `Invalid request ${path}: ${first?.message ?? "malformed body"}`,
  };
}
