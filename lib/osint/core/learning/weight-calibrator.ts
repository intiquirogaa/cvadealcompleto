import { db } from "@/lib/db";
import { DEFAULT_CONFIDENCE_WEIGHTS } from "../../config/default.config";
import type { ConfidenceWeights } from "../../types";

export class WeightCalibrator {
  
  /**
   * Recalculates confidence weights based on human feedback.
   * If a specific source (provider) or field consistently receives negative feedback,
   * its weight will be downgraded. If it receives positive feedback, it can be boosted.
   */
  public async calibrateWeights(): Promise<ConfidenceWeights> {
    try {
      // 1. Fetch feedback statistics
      const feedback = await db.osintFeedback.findMany({
        select: {
          field: true,
          isCorrect: true,
        },
      });

      if (feedback.length === 0) {
        return DEFAULT_CONFIDENCE_WEIGHTS; // No feedback yet, use defaults
      }

      // 2. Simple Bayesian or ratio-based update
      let correctCount = 0;
      let totalCount = feedback.length;

      for (const f of feedback) {
        if (f.isCorrect) correctCount++;
      }

      const successRate = correctCount / totalCount;
      
      // We can adjust the weights slightly based on overall success.
      // In a real implementation, we would group by `provider` (by joining evidence)
      // and adjust specific weights like sourceReliability vs recency.
      
      const adjustedWeights: ConfidenceWeights = {
        ...DEFAULT_CONFIDENCE_WEIGHTS,
        // If overall success rate is low, maybe we demand more corroboration
        corroboration: successRate < 0.5 ? 0.35 : DEFAULT_CONFIDENCE_WEIGHTS.corroboration,
        sourceReliability: successRate < 0.5 ? 0.35 : DEFAULT_CONFIDENCE_WEIGHTS.sourceReliability,
      };

      return adjustedWeights;
    } catch (err) {
      console.error("Failed to calibrate weights", err);
      return DEFAULT_CONFIDENCE_WEIGHTS;
    }
  }

  public getWeightsSync(): ConfidenceWeights {
    return DEFAULT_CONFIDENCE_WEIGHTS;
  }
}

export const weightCalibrator = new WeightCalibrator();
