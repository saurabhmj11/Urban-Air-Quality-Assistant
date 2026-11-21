import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** Shares the family bucket with POST /api/family. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // --- Rate limit ---
  const rl = rateLimit(`family:${clientIp(req.headers)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many changes. Try again in ${rl.resetInSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.resetInSec) } }
    );
  }

  try {
    const { id } = await params;
    // Prisma throws P2025 when the record does not exist → 404, not 500.
    await db.familyMember.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    console.error("family delete error:", err);
    return NextResponse.json({ error: "Failed to delete member" }, { status: 500 });
  }
}
