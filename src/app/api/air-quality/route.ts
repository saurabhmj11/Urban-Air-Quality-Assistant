import { NextRequest, NextResponse } from "next/server";
import { getAirQuality } from "@/lib/air-quality-server";
import { CITIES } from "@/lib/aqi";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cityId = req.nextUrl.searchParams.get("city") ?? "delhi";
  if (!CITIES.some((c) => c.id === cityId)) {
    // Explicit unknown city: say so instead of silently serving Delhi.
    const valid = CITIES.map((c) => c.id).join(", ");
    return NextResponse.json(
      { error: `Unknown city "${cityId}". Valid ids: ${valid}.` },
      { status: 400 }
    );
  }
  try {
    const snapshot = await getAirQuality(cityId);
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: "Failed to load air quality data" },
      { status: 500 }
    );
  }
}
