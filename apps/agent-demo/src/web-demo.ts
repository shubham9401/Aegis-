import { runChainAgent } from "./chain-agent.js";

// One connected transport: signed /api/chain/payments requests and the on-chain UI.
// The isolated, seeded simulation remains available through `npm run demo`.
if (process.env.NEXT_PUBLIC_ADAPTER !== "contract") {
  throw new Error("The connected agent requires NEXT_PUBLIC_ADAPTER=contract. Use npm run demo for the labelled local policy simulation.");
}
await runChainAgent();
