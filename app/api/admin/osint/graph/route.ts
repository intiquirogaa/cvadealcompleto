import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("runId");

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    // Fetch all entities created or updated during this run
    // Since our schema might not strictly isolate by runId for entities (they are shared),
    // we fetch evidence for this runId and then extract the entities, OR if relations have a runId.
    // Let's check how we link them. 
    // `OsintEvidence` has `runId` and `entityId`.
    const evidence = await db.osintEvidence.findMany({
      where: { runId },
      select: { entityId: true }
    });

    const entityIds = [...new Set(evidence.map(e => e.entityId).filter(Boolean))] as string[];

    if (entityIds.length === 0) {
      return NextResponse.json({ success: true, data: { nodes: [], edges: [] } });
    }

    const entities = await db.osintEntity.findMany({
      where: { id: { in: entityIds } }
    });

    const relations = await db.osintRelation.findMany({
      where: {
        OR: [
          { sourceId: { in: entityIds } },
          { targetId: { in: entityIds } }
        ]
      }
    });

    // Format for React Flow / Force Graph
    const nodes = entities.map(e => ({
      id: e.id,
      type: e.type,
      label: e.type,
      data: {
        label: e.type,
        properties: e.properties,
        confidence: e.confidence
      }
    }));

    const edges = relations.map(r => ({
      id: r.id,
      source: r.sourceId,
      target: r.targetId,
      type: r.type,
      label: r.type,
      data: {
        confidence: r.confidence
      }
    }));

    return NextResponse.json({
      success: true,
      data: { nodes, edges }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
