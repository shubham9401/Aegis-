"use client";
import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, http, parseAbi, type Address } from "viem";
import { monadTestnet } from "viem/chains";
import { openPasskey } from "./passkey";
import { aegisAbi } from "../../../../contracts/integration/abi";
export { aegisAbi };
export interface ChainConfig { address: Address; token: Address; registry: Address; scope: `0x${string}`; rpcUrl: string; agentId: string; recipient: string; symbol: string }
export type OwnerOperation = "grantPermission" | "revokePermission" | "deposit" | "withdraw" | "approvePayment" | "cancelPaymentApproval";
/** Called only from explicit review/submit buttons; never accepts server-provided calldata. */
export async function ownerWrite(config: ChainConfig, expected: Address, operation: OwnerOperation | "approveToken" | "mintDemo", args: readonly unknown[]) {
  const fresh = await openPasskey();
  try {
    if (fresh.account.address.toLowerCase() !== expected.toLowerCase()) throw new Error("This passkey does not belong to the signed-in account.");
    const client = createPublicClient({ chain: monadTestnet, transport: http(config.rpcUrl, { batch: false }) });
    if (await client.getChainId() !== 10143) throw new Error("Wrong network; Monad testnet required.");
    const token = operation === "approveToken" || operation === "mintDemo";
    const abi = operation === "approveToken" ? erc20Abi : operation === "mintDemo" ? parseAbi(["function mint(address to,uint256 amount)"]) : aegisAbi;
    const functionName = operation === "approveToken" ? "approve" : operation === "mintDemo" ? "mint" : operation;
    // ABI is selected locally; the operation union restricts allowed owner writes.
    const data = encodeFunctionData({ abi, functionName, args } as Parameters<typeof encodeFunctionData>[0]);
    const to = token ? config.token : config.address;
    const estimate = await client.estimateGas({ account: expected, to, data });
    const gas = estimate * 120n / 100n;
    if (gas > 1_500_000n) throw new Error("Gas estimate exceeds the demo transaction limit.");
    const wallet = createWalletClient({ account: fresh.account, chain: monadTestnet, transport: http(config.rpcUrl, { batch: false }) });
    const hash = await wallet.sendTransaction({ to, data, gas });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120000 });
    if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
    return receipt;
  } finally { fresh.session.end(); }
}
