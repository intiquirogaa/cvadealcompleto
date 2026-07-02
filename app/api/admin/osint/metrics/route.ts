import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/db";

export async function GET() {
  try {
    const totalRuns = await db.osintRun.count();
    const successfulRuns = await db.osintRun.count({ where: { status: "completed" } });
    const failedRuns = await db.osintRun.count({ where: { status: "failed" } });
    const partialRuns = await db.osintRun.count({ where: { status: "partial" } });
    
    const runs = await db.osintRun.findMany({
      select: { durationMs: true, cyclesExecuted: true },
      take: 100, // sample last 100 for avg
      orderBy: { startedAt: "desc" }
    });

    let avgDuration = 0;
    let avgCycles = 0;
    
    if (runs.length > 0) {
      avgDuration = runs.reduce((acc, run) => acc + run.durationMs, 0) / runs.length;
      avgCycles = runs.reduce((acc, run) => acc + run.cyclesExecuted, 0) / runs.length;
    }

    const manualTriggers = await db.osintRun.count({ where: { trigger: "manual" } });
    const scheduledTriggers = await db.osintRun.count({ where: { trigger: "scheduled" } });

    // Estimate cost (assuming 1 request = ~$0.015 as a placeholder if cost isn't accumulated)
    // A more precise cost could be extracted from metricsJson if we parsed it.
    const estimatedCostUsd = totalRuns * 0.15; // Placeholder for OSINT average cost

    return NextResponse.json({
      success: true,
      data: {
        totalRuns,
        successfulRuns,
        failedRuns,
        partialRuns,
        avgDurationMs: Math.round(avgDuration),
        avgCycles: Number(avgCycles.toFixed(1)),
        triggers: {
          manual: manualTriggers,
          scheduled: scheduledTriggers,
        },
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(2)),
        successRate: totalRuns > 0 ? Number(((successfulRuns / totalRuns) * 100).toFixed(1)) : 0
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
