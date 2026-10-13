import fs from "node:fs";
import { Contract, JsonRpcProvider } from "ethers";
import { parseTestAmount } from "@aegis/sdk";
import { loadAgentWallet } from "./agent-proof.js";
const [parentRaw, childRaw, actionsRaw = "1", limitRaw = "0"] = process.argv.slice(2);
if (!parentRaw || !childRaw) throw new Error("Usage: npm run delegate --workspace @aegis/agent-demo -- <parentPermissionId> <childAgentId> [actionBits=1] [testTokenLimit=0]");
const provider = new JsonRpcProvider(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz", 10143, { batchMaxCount: 1 });
try {
  if ((await provider.getNetwork()).chainId !== 10143n) throw new Error("Wrong network");
  const signer = (await loadAgentWallet()).connect(provider);
  const abi = JSON.parse(fs.readFileSync(new URL("../../../contracts/artifacts/AegisPermissions.abi.json", import.meta.url), "utf8"));
  const address = process.env.AEGIS_CONTRACT_ADDRESS; if (!address) throw new Error("Set AEGIS_CONTRACT_ADDRESS");
  const contract = new Contract(address, abi, signer);
  const parentId = BigInt(parentRaw), parent = await contract.getPermission!(parentId);
  const args = [parentId, BigInt(childRaw), BigInt(actionsRaw), parseTestAmount(limitRaw), parent.expiresAt, false] as const;
  await contract.delegatePermission!.staticCall(...args);
  const gas = await contract.delegatePermission!.estimateGas(...args) * 120n / 100n;
  if (gas > 1_500_000n) throw new Error("Gas limit exceeded");
  const tx = await contract.delegatePermission!(...args, { gasLimit: gas });
  console.log(`Delegation submitted: ${tx.hash}`);
  const receipt = await tx.wait(); if (receipt?.status !== 1) throw new Error("Delegation reverted");
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) continue;
    const event = contract.interface.parseLog(log);
    if (event?.name === "PermissionGranted") console.log(`Child permission ID: ${event.args.permissionId}`);
  }
} finally { provider.destroy(); }
