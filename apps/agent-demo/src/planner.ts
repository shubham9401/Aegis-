import type { AgentAction, DataScope } from "@aegis/sdk";

export interface TravelPlan {
  summary: string;
  requestedDataScopes: DataScope[];
  proposedAction: {
    action: AgentAction;
    amountMinor: string;
    currency: string;
    service: string;
  };
}

export interface TravelPlanner {
  plan(userRequest: string): Promise<TravelPlan>;
}

export class LocalTravelPlanner implements TravelPlanner {
  async plan(userRequest: string): Promise<TravelPlan> {
    return {
      summary: `Local demo plan for: ${userRequest}`,
      requestedDataScopes: [
        "profile:dietary-preference",
        "profile:travel-budget",
      ],
      proposedAction: {
        action: "travel:book",
        amountMinor: "40000",
        currency: "USD",
        service: "demo-airline",
      },
    };
  }
}
