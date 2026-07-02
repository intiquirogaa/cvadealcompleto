import { NextResponse } from "next/server";
import { enqueueOsintRun } from "@/lib/queue/osint.queue";
import { prisma } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: Request) {
  try {
    const { clientId } = await req.json();

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const runId = uuidv4();

    // 1. Create a pending run in DB
    await prisma.osintRun.create({
      data: {
        id: runId,
        clientId,
        status: "pending",
        trigger: "manual",
      },
    });

    // 2. Enqueue job to BullMQ
    await enqueueOsintRun(runId, clientId, "manual");

    // 3. Return 202 Accepted immediately
    return NextResponse.json({ success: true, runId }, { status: 202 });
  } catch (error: any) {
    console.error("OSINT Queue error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
