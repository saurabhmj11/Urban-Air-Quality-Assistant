import { NextRequest, NextResponse } from "next/server";
import { getAirQuality } from "@/lib/air-quality-server";
import { CITIES } from "@/lib/aqi";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cityId = req.nextUrl.searchParams.get("city") ?? "delhi";
  const valid = CITIES.some((c) => c.id === cityId) ? cityId : "delhi";
  try {
    const snapshot = await getAirQuality(valid);
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: "Failed to load air quality data" },
      { status: 500 }
    );
  }
}
