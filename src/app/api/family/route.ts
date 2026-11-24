import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sensitivityFor } from "@/lib/aqi";
import { guardRoute } from "@/lib/api";
import { memberCreateSchema } from "@/lib/validation";

/** 30 member writes per 5 minutes per IP (generous — this is local data). */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    const members = await db.familyMember.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json(
      members.map((m) => ({
        ...m,
        sensitivity: sensitivityFor(m.ageGroup, m.conditions),
      }))
    );
  } catch {
    return NextResponse.json({ error: "Failed to load family" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, {
    key: "family",
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
    rateMessage: "Too many changes",
    schema: memberCreateSchema,
  });
  if (!guard.ok) return guard.response;
  const { name, ageGroup, conditions } = guard.value;

  try {
    const member = await db.familyMember.create({
      data: {
        name: name.trim(),
        ageGroup,
        // Schema already rejects invalid values, so conditions are clean here.
        conditions: (conditions ?? []).join(","),
      },
    });
    return NextResponse.json(
      { ...member, sensitivity: sensitivityFor(member.ageGroup, member.conditions) },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
