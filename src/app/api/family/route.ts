import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sensitivityFor } from "@/lib/aqi";
import { memberCreateSchema, parseBody } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";

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
  // --- Rate limit ---
  const rl = rateLimit(`family:${clientIp(req.headers)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many changes. Try again in ${rl.resetInSec}s.` },
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
  const parsed = parseBody(memberCreateSchema, raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, ageGroup, conditions } = parsed.value;

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
