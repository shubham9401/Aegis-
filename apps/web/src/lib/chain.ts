import "server-only";
import { createPublicClient, erc20Abi, getAddress, http, parseAbi, type Address } from "viem";
import { monadTestnet } from "viem/chains";
import { aegisAbi } from "../../../../contracts/integration/abi";
import deployment from "../../../../contracts/deployments/monad-testnet.json";
export { aegisAbi };
export function chainConfig() {
  if (process.env.NEXT_PUBLIC_ADAPTER !== "contract") throw new Error("Contract mode is not enabled.");
  const scope = process.env.AEGIS_RESOURCE_SCOPE || "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(scope) || BigInt(scope) === 0n) throw new Error("Configure an opaque nonzero AEGIS_RESOURCE_SCOPE.");
  return {
    address: getAddress(process.env.AEGIS_CONTRACT_ADDRESS || deployment.aegisAddress),
    token: getAddress(process.env.AEGIS_PAYMENT_TOKEN_ADDRESS || deployment.paymentTokenAddress), registry: getAddress(process.env.AEGIS_IDENTITY_REGISTRY_ADDRESS || deployment.identityRegistryAddress),
    scope: scope as `0x${string}`, chainId: 10143, decimals: 6, symbol: "aUSD-TEST", demo: true,
    agentId: process.env.AEGIS_AGENT_ID || "2088",
    recipient: process.env.AEGIS_MERCHANT_ADDRESS || "",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz",
  } as const;
}
export async function chainReader() {
  const config = chainConfig();
  const client = createPublicClient({ chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL || config.rpcUrl, { batch: false, retryCount: 1, timeout: 15000 }) });
  const [network, code, token, registry, actions] = await Promise.all([
    client.getChainId(), client.getBytecode({ address: config.address }),
    client.readContract({ address: config.address, abi: aegisAbi, functionName: "paymentToken" }),
    client.readContract({ address: config.address, abi: aegisAbi, functionName: "identityRegistry" }),
    client.readContract({ address: config.address, abi: aegisAbi, functionName: "ALL_ACTIONS" }),
  ]);
  if (network !== 10143 || !code || code === "0x" || actions !== 63n ||
      token.toLowerCase() !== config.token.toLowerCase() || registry.toLowerCase() !== config.registry.toLowerCase()) {
    throw new Error("Contract/network configuration does not match the verified deployment.");
  }
  return { client, config };
}
export async function livePermission(id: bigint) {
  const { client, config } = await chainReader();
  const [permission, status] = await Promise.all([
    client.readContract({ address: config.address, abi: aegisAbi, functionName: "getPermission", args: [id] }),
    client.readContract({ address: config.address, abi: aegisAbi, functionName: "permissionStatus", args: [id] }),
  ]);
  return { client, config, permission, status };
}
export async function registeredOwner(id: bigint): Promise<Address> {
  const { client, config } = await chainReader();
  return client.readContract({ address: config.registry, abi: parseAbi(["function ownerOf(uint256) view returns(address)"]), functionName: "ownerOf", args: [id] });
}
export async function userChainState(user: Address, cursor = 1n) {
  const { client, config } = await chainReader();
  const [next, balance, tokenBalance, gasBalance] = await Promise.all([
    client.readContract({ address: config.address, abi: aegisAbi, functionName: "nextPermissionId" }),
    client.readContract({ address: config.address, abi: aegisAbi, functionName: "balances", args: [user] }),
    client.readContract({ address: config.token, abi: erc20Abi, functionName: "balanceOf", args: [user] }),
    client.getBalance({ address: user }),
  ]);
  // Paginate enumeration; never silently omit grants behind an arbitrary global cap.
  const end = cursor + 25n < next ? cursor + 25n : next;
  const permissions = [];
  for (let id = cursor; id < end; id++) {
    const permission = await client.readContract({ address: config.address, abi: aegisAbi, functionName: "getPermission", args: [id] });
    if (permission.user.toLowerCase() !== user.toLowerCase()) continue;
    const status = await client.readContract({ address: config.address, abi: aegisAbi, functionName: "permissionStatus", args: [id] });
    permissions.push({ id, ...permission, status });
  }
  return { config, balance, tokenBalance, gasBalance, permissions, nextCursor: end < next ? end : null };
}
export function chainJson(value: unknown, status = 200) {
  return new Response(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
