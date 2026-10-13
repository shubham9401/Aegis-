import { runChainAgent } from "./chain-agent.js";

// One connected transport: signed /api/chain/payments requests and the on-chain UI.
// The isolated, seeded simulation remains available through `npm run demo`.
if (process.env.NEXT_PUBLIC_ADAPTER !== "contract") {
  throw new Error("The connected agent requires NEXT_PUBLIC_ADAPTER=contract and the server Kimi planner. Use npm run demo only for the labelled local simulation.");
}
await runChainAgent();
