import { GraphStore } from "../persistence/graph-store";
import { AGENT_IDS } from "../agents/agent.registry";

export class StrategyOptimizer {
  private store: GraphStore;
  
  // Base default probabilities
  private defaultProbabilities: Record<string, number> = {
    [AGENT_IDS.SEARCH]: 0.9,
    [AGENT_IDS.IDENTITY]: 0.85,
    [AGENT_IDS.COMPANY]: 0.75,
    [AGENT_IDS.SOCIAL]: 0.6,
    [AGENT_IDS.PHONE]: 0.4,
    [AGENT_IDS.EMAIL]: 0.45,
    [AGENT_IDS.NEWS]: 0.55,
    [AGENT_IDS.WEBSITE]: 0.7,
  };

  constructor(store: GraphStore) {
    this.store = store;
  }

  /**
   * For now, this returns the default probabilities.
   * In a future update, this would query historical OsintRun records
   * and calculate the actual success rate of each agent (e.g. how many
   * times PhoneAgent found a phone number vs how many times it was called).
   * 
   * @returns A map of agentId to historical discovery probability
   */
  public async getDiscoveryProbabilities(): Promise<Record<string, number>> {
    // Placeholder for future database-driven learning
    // This allows the planner-agent to call this method dynamically
    return this.defaultProbabilities;
  }

  /**
   * Synchronous version for use within the tight planner loop
   */
  public getDiscoveryProbabilitiesSync(): Record<string, number> {
    return this.defaultProbabilities;
  }
}

// Ensure the singleton can be injected or imported
import { graphStore } from "../persistence/graph-store";
export const strategyOptimizer = new StrategyOptimizer(graphStore);
