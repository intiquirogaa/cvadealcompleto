import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      // Get single run with details
      const run = await db.osintRun.findUnique({
        where: { id },
      });
      if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: run });
    }

    // List recent runs
    const runs = await db.osintRun.findMany({
      take: 50,
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        clientId: true,
        trigger: true,
        status: true,
        cyclesExecuted: true,
        startedAt: true,
        durationMs: true,
        error: true,
      }
    });

    return NextResponse.json({ success: true, data: runs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
