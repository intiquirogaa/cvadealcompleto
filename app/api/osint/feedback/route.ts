import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/db";
import { weightCalibrator } from "@/lib/osint/core/learning/weight-calibrator";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { runId, entityId, field, isCorrect, comments } = body;

    if (!runId || typeof isCorrect !== "boolean") {
      return NextResponse.json(
        { error: "runId and isCorrect are required" },
        { status: 400 }
      );
    }

    // Guardar el feedback en la BD
    const feedback = await db.osintFeedback.create({
      data: {
        runId,
        entityId,
        field,
        isCorrect,
        comments,
      },
    });

    // En segundo plano, podemos recalibrar los pesos.
    // En una implementación real, esto se haría mediante un cron job o
    // después de N feedbacks nuevos para no afectar el rendimiento.
    weightCalibrator.calibrateWeights().catch((err) => {
      console.error("Background weight calibration failed:", err);
    });

    return NextResponse.json({ success: true, feedback });
  } catch (error: any) {
    console.error("OSINT Feedback API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}
