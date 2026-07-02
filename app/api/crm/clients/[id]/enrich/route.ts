export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enqueueOsintRun } from "@/lib/queue/osint.queue";
import { v4 as uuidv4 } from "uuid";

// POST /api/crm/clients/[id]/enrich - Queues an OSINT investigation
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (
      !session?.user ||
      !["admin", "advisor"].includes((session.user as any)?.role ?? "")
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = params;
    const client = await prisma.cRMClient.findUnique({ where: { id } });

    if (!client) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    const runId = uuidv4();

    // 1. Create a pending run in DB
    await prisma.osintRun.create({
      data: {
        id: runId,
        clientId: client.id,
        status: "pending",
        trigger: "manual",
      },
    });

    // 2. Enqueue job to BullMQ
    await enqueueOsintRun(runId, client.id, "manual");

    // 3. Return 202 Accepted immediately
    return NextResponse.json({ success: true, runId }, { status: 202 });
  } catch (e: any) {
    console.error("CRM client enrichment error:", e);
    return NextResponse.json(
      { error: "Error al encolar enriquecimiento" },
      { status: 500 }
    );
  }
}
