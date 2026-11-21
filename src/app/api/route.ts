import { NextResponse } from "next/server";

/**
 * Health-check endpoint for uptime monitors and deployment smoke tests.
 * Reports whether the app can reach the live air-quality provider.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let upstream = "unknown";
  try {
    const res = await fetch(
      "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.6139&longitude=77.209&current=pm2_5",
      { signal: AbortSignal.timeout(4000) }
    );
    upstream = res.ok ? "reachable" : `http-${res.status}`;
  } catch {
    upstream = "unreachable (offline simulation will be used)";
  }
  return NextResponse.json(
    {
      status: "ok",
      service: "breatheasy",
      openMeteo: upstream,
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
