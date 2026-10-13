import fs from "node:fs";
import { Contract, JsonRpcProvider, hexlify, randomBytes } from "ethers";
import { AegisApiClient, CHAIN_STATUS, PAYMENT_REQUEST_TYPES, centsToTestUnits, type Address, type ChainPaymentRequest } from "@aegis/sdk";
import { loadAgentWallet, createAgentContextProofProvider } from "./agent-proof.js";
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
export async function runChainAgent() {
  const provider = new JsonRpcProvider(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz", 10143, { batchMaxCount: 1 });
  try {
    if ((await provider.getNetwork()).chainId !== 10143n) throw new Error("Wrong chain");
    const signer = (await loadAgentWallet()).connect(provider);
    const address = required("AEGIS_CONTRACT_ADDRESS");
    const abi = JSON.parse(fs.readFileSync(new URL("../../../contracts/artifacts/AegisPermissions.abi.json", import.meta.url), "utf8"));
    const contract = new Contract(address, abi, signer);
    const id = BigInt(required("AEGIS_PERMISSION_ID"));
    const permission = await contract.getPermission!(id);
    if (permission.agent.toLowerCase() !== signer.address.toLowerCase()) throw new Error("This agent does not own the selected permission");
    const status = Number(await contract.permissionStatus!(id));
    if (status !== 0) throw new Error(`Permission denied: ${CHAIN_STATUS[status]}`);
    const api = new AegisApiClient({ baseUrl: process.env.AEGIS_WEB_URL || "http://localhost:3000", agentToken: required("AEGIS_DEMO_AGENT_TOKEN"), contextProofProvider: await createAgentContextProofProvider(signer) });
    const prompt = process.argv.slice(2).join(" ");
    if (!prompt) throw new Error("Provide a request with exact USD amount and the approved recipient address as the service.");
    const { plan } = await api.plan(prompt);
    console.log("Planner: server Kimi. Authorization remains deterministic.");
    for (const scope of plan.requestedDataScopes) {
      await api.requestContext({ user: permission.user as Address, agentId: String(permission.agentId), permissionId: String(id), scope });
      console.log(`Approved fact received: ${scope} (value omitted from logs)`);
    }
    if (plan.proposedAction.action !== "travel:book" || plan.proposedAction.currency !== "USD") throw new Error("Demo payment requires travel:book in USD test units");
    if (plan.proposedAction.service.toLowerCase() !== permission.paymentRecipient.toLowerCase()) throw new Error("Planner service must match the exact approved merchant wallet");
    const amount = centsToTestUnits(plan.proposedAction.amountMinor);
    if (amount <= 0n) throw new Error("Payment amount must be positive");
    const requestIdRaw = process.env.AEGIS_PAYMENT_REQUEST_ID || hexlify(randomBytes(32));
    if (!/^0x[0-9a-fA-F]{64}$/.test(requestIdRaw) || BigInt(requestIdRaw) === 0n) throw new Error("AEGIS_PAYMENT_REQUEST_ID must be nonzero bytes32");
    const requestId = requestIdRaw as `0x${string}`;
    console.log(`Payment request ID: ${requestId}. Reuse this ID through AEGIS_PAYMENT_REQUEST_ID when retrying this payment.`);
    const key = await contract.requestKey!(permission.rootId, requestId);
    if (await contract.usedRequests!(key)) throw new Error("This request ID was already consumed. Check its receipt before starting a new payment.");
    const paymentStatus = Number(await contract.checkPayment!(id, signer.address, permission.paymentRecipient, amount));
    if (paymentStatus !== 0 && paymentStatus !== 10) throw new Error(`Payment blocked: ${CHAIN_STATUS[paymentStatus]}`);
    if (paymentStatus === 10) {
      const deadline = process.env.AEGIS_PAYMENT_DEADLINE ? Number(process.env.AEGIS_PAYMENT_DEADLINE) : Math.min(Math.floor(Date.now() / 1000) + 600, Number(permission.expiresAt));
      if (!Number.isSafeInteger(deadline) || deadline <= Math.floor(Date.now() / 1000)) throw new Error("Invalid or expired payment deadline");
      console.log(`Approval deadline: ${deadline}. Preserve it as AEGIS_PAYMENT_DEADLINE when resuming this pending request.`);
      const input = { permissionId: String(id), requestId, recipient: permission.paymentRecipient as Address, amount: String(amount), deadline };
      const signature = await signer.signTypedData({ name: "AegisPayments", version: "1", chainId: 10143, verifyingContract: address },
        { PaymentRequest: PAYMENT_REQUEST_TYPES.PaymentRequest.map((field) => ({ ...field })) },
        { ...input, audience: process.env.AEGIS_APP_ORIGIN || "http://localhost:3000" });
      const signed: ChainPaymentRequest = { ...input, signature: signature as `0x${string}` };
      console.log("Automatic spending blocked. Open Approvals to approve this exact extra test payment.");
      while (true) {
        if (Math.floor(Date.now() / 1000) >= deadline) throw new Error("Payment request expired");
        const result = await api.requestChainPayment(signed);
        if (result.outcome === "approved") break;
        if (result.outcome !== "pending") throw new Error(`Payment stopped: ${result.outcome}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    // Simulation is advisory. pay itself atomically rechecks revocation, budgets, balance and replay.
    await contract.pay!.staticCall(id, permission.paymentRecipient, amount, requestId);
    const gas = await contract.pay!.estimateGas(id, permission.paymentRecipient, amount, requestId) * 120n / 100n;
    if (gas > 1_500_000n) throw new Error("Gas limit exceeded");
    const tx = await contract.pay!(id, permission.paymentRecipient, amount, requestId, { gasLimit: gas });
    console.log(`Payment submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1) throw new Error("Payment reverted");
    console.log(`Test-token payment confirmed: ${tx.hash}. No airline reservation was made.`);
  } finally { provider.destroy(); }
}
