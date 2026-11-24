/**
 * Shared API-route plumbing (server-only).
 *
 * Every JSON POST route repeats the same three guards — rate limit, JSON
 * parsing and schema validation — followed by the same error envelope.
 * `guardRoute` collapses them into one typed call: it never throws and
 * returns either the parsed, schema-typed body or a ready-to-return
 * error response, so routes contain only domain logic.
 */
import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validation";

/**
 * The subset of NextRequest the guard needs. Structural (not the full
 * NextRequest class) so tests can pass a plain object.
 */
export interface GuardableRequest {
  headers: Headers;
  json: () => Promise<unknown>;
}

export interface RouteGuardOptions<S extends z.ZodType> {
  /** Rate-limit bucket prefix, e.g. "chat" — combined with the client IP. */
  key: string;
  /** Max requests per window per IP. */
  limit: number;
  /** Rate-limit window in milliseconds. */
  windowMs: number;
  /** Friendly 429 message prefix; the wait time is appended automatically. */
  rateMessage: string;
  /** Zod schema the JSON body must satisfy. */
  schema: S;
}

export type RouteGuard<S extends z.ZodType> =
  | { ok: true; value: z.infer<S> }
  | { ok: false; response: NextResponse };

export async function guardRoute<S extends z.ZodType>(
  req: GuardableRequest | NextRequest,
  opts: RouteGuardOptions<S>
): Promise<RouteGuard<S>> {
  // --- Rate limit (protects the LLM budget) ---
  const rl = rateLimit(
    `${opts.key}:${clientIp(req.headers)}`,
    opts.limit,
    opts.windowMs
  );
  if (!rl.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `${opts.rateMessage} — try again in ${rl.resetInSec}s.` },
        { status: 429, headers: { "Retry-After": String(rl.resetInSec) } }
      ),
    };
  }

  // --- JSON body ---
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }

  // --- Schema ---
  const parsed = parseBody(opts.schema, raw);
  if (!parsed.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: parsed.error }, { status: 400 }),
    };
  }
  return { ok: true, value: parsed.value };
}

/**
 * Log a route failure and build the uniform error envelope.
 * 502 for upstream (LLM/air-data) failures, 500 for local ones.
 */
export function routeError(
  route: string,
  err: unknown,
  message: string,
  status: 500 | 502 = 502
): NextResponse {
  console.error(`${route} error:`, err);
  return NextResponse.json({ error: message }, { status });
}
