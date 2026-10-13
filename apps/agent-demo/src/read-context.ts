import fs from "node:fs";
import { Contract, JsonRpcProvider } from "ethers";
import { AegisApiClient, CONTRACT_DATA_ACTION, type DataScope, type Address } from "@aegis/sdk";
import { loadAgentWallet, createAgentContextProofProvider } from "./agent-proof.js";
const field = process.argv[2] as DataScope;
if (!Object.hasOwn(CONTRACT_DATA_ACTION, field)) throw new Error("Specify profile:dietary-preference, profile:travel-budget, or profile:passport-validity");
const provider = new JsonRpcProvider(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz", 10143, { batchMaxCount: 1 });
try {
  const wallet = await loadAgentWallet();
  const id = process.env.AEGIS_PERMISSION_ID, address = process.env.AEGIS_CONTRACT_ADDRESS;
  if (!id || !address) throw new Error("Configure AEGIS_PERMISSION_ID and AEGIS_CONTRACT_ADDRESS");
  const abi = JSON.parse(fs.readFileSync(new URL("../../../contracts/artifacts/AegisPermissions.abi.json", import.meta.url), "utf8"));
  const permission = await new Contract(address, abi, provider).getPermission!(BigInt(id));
  const api = new AegisApiClient({ baseUrl: process.env.AEGIS_WEB_URL || "http://localhost:3000", agentToken: process.env.AEGIS_DEMO_AGENT_TOKEN || "signature-only", contextProofProvider: await createAgentContextProofProvider(wallet) });
  await api.requestContext({ user: permission.user as Address, agentId: String(permission.agentId), permissionId: id, scope: field });
  console.log(`Allowed: ${field}. Private value omitted from logs.`);
} catch (error) { console.error(error instanceof Error ? error.message : "Context denied"); process.exitCode = 1; }
finally { provider.destroy(); }
