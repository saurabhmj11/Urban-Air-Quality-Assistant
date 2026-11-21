import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sensitivityFor } from "@/lib/aqi";

const AGE_GROUPS = ["child", "teen", "adult", "senior"];
const CONDITIONS = ["asthma", "heart", "copd", "pregnancy", "diabetes", "smoker", "none"];

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
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim().slice(0, 40);
    const ageGroup = String(body.ageGroup ?? "adult");
    const rawConditions: string[] = Array.isArray(body.conditions) ? body.conditions : [];

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!AGE_GROUPS.includes(ageGroup)) {
      return NextResponse.json({ error: "Invalid age group" }, { status: 400 });
    }
    const valid = rawConditions.filter((c) => CONDITIONS.includes(c) && c !== "none");
    const conditions = valid.length > 0 ? valid.join(",") : "";

    const member = await db.familyMember.create({
      data: { name, ageGroup, conditions },
    });
    return NextResponse.json(
      { ...member, sensitivity: sensitivityFor(member.ageGroup, member.conditions) },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
