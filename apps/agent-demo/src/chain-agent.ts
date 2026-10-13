import fs from "node:fs";
import { Contract, JsonRpcProvider } from "ethers";
import { AegisApiClient, CHAIN_STATUS, PAYMENT_REQUEST_TYPES, centsToTestUnits, type Address, type ChainPaymentRequest, type ContextRelease, type DataScope } from "@aegis/sdk";
import { loadAgentWallet, createAgentContextProofProvider } from "./agent-proof.js";
import { checkReleasedContext, paymentIntent } from "./payment-guard.js";
import { openPaymentJournal, paymentFingerprint, type PaymentJournal } from "./payment-journal.js";
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
export async function runChainAgent() {
  const prompt = process.argv.slice(2).join(" ").trim();
  const intent = paymentIntent(prompt);
  const provider = new JsonRpcProvider(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz", 10143, { batchMaxCount: 1 });
  let journal: ReturnType<typeof openPaymentJournal> | undefined;
  try {
    if ((await provider.getNetwork()).chainId !== 10143n) throw new Error("Wrong chain");
    const signer = (await loadAgentWallet()).connect(provider);
    const address = required("AEGIS_CONTRACT_ADDRESS");
    const abi = JSON.parse(fs.readFileSync(new URL("../../../contracts/artifacts/AegisPermissions.abi.json", import.meta.url), "utf8"));
    const contract = new Contract(address, abi, signer);
    const id = BigInt(required("AEGIS_PERMISSION_ID"));
    const permission = await contract.getPermission!(id);
    if (permission.agent.toLowerCase() !== signer.address.toLowerCase()) throw new Error("This agent does not own the selected permission");
    if (intent.recipient.toLowerCase() !== permission.paymentRecipient.toLowerCase()) throw new Error("Explicit payment recipient differs from your granted merchant.");
    const fingerprint = paymentFingerprint(address, String(id), signer.address, prompt);
    journal = openPaymentJournal(fingerprint, process.env.AEGIS_PAYMENT_REQUEST_ID);
    const requestId = journal.requestId;
    console.log(`Payment request ID: ${requestId}. This instruction resumes the same journal on retry.`);
    const key = await contract.requestKey!(permission.rootId, requestId);
    if (journal.record?.transactionHash) {
      const receipt = await provider.waitForTransaction(journal.record.transactionHash, 1, 120000);
      if (!receipt) throw new Error("Submitted transaction is still unresolved. Retry the same instruction; do not create a new request ID.");
      if (receipt.status !== 1) throw new Error("The submitted transaction reverted. Inspect the receipt before creating a new request.");
      if (!await contract.usedRequests!(key)) throw new Error("Receipt did not consume this payment request; manual reconciliation required.");
      journal.save({ ...journal.record, confirmed: true });
      console.log(`Previously submitted test-token payment confirmed: ${receipt.hash}. No airline reservation was made.`);
      return;
    }
    if (await contract.usedRequests!(key)) throw new Error("This payment request was already consumed. Inspect its contract receipt; no duplicate payment will be sent.");
    const status = Number(await contract.permissionStatus!(id));
    if (status !== 0) throw new Error(`Permission denied: ${CHAIN_STATUS[status]}`);
    const api = new AegisApiClient({ baseUrl: process.env.AEGIS_WEB_URL || "http://localhost:3000", agentToken: required("AEGIS_DEMO_AGENT_TOKEN"), contextProofProvider: await createAgentContextProofProvider(signer) });
    let record: PaymentJournal;
    if (journal.record) {
      record = journal.record;
      if (record.amountMinor !== intent.amountMinor || record.recipient.toLowerCase() !== intent.recipient.toLowerCase()) throw new Error("Journal and explicit payment instruction differ.");
      console.log("Resuming the previously validated Kimi proposal. Private profile values are rechecked.");
    } else {
      const { plan } = await api.plan(prompt);
      console.log("Planner: server Kimi. Authorization remains deterministic.");
      if (plan.proposedAction.action !== "travel:book" || plan.proposedAction.currency !== "USD") throw new Error("Connected payment requires travel:book in USD test units");
      if (plan.proposedAction.service.toLowerCase() !== intent.recipient.toLowerCase() || plan.proposedAction.amountMinor !== intent.amountMinor) throw new Error("Kimi proposal differs from the exact payment instruction. No payment was submitted.");
      record = { version: 1, fingerprint, requestId, amountMinor: intent.amountMinor, recipient: intent.recipient, requestedDataScopes: plan.requestedDataScopes };
      journal.save(record);
    }
    const authorizedFacts: [bigint, DataScope][] = [[1n, "profile:dietary-preference"], [16n, "profile:travel-budget"], [32n, "profile:passport-validity"]];
    const scopes = new Set([...record.requestedDataScopes, ...authorizedFacts.filter(([bit]) => (permission.actions & bit) !== 0n).map(([, scope]) => scope)]);
    const validateContext = async () => {
      const facts: ContextRelease[] = [];
      for (const scope of scopes) {
        facts.push(await api.requestContext({ user: permission.user as Address, agentId: String(permission.agentId), permissionId: String(id), scope }));
        console.log(`Approved fact received: ${scope} (value omitted from logs)`);
      }
      for (const message of checkReleasedContext(facts, record.amountMinor, "USD")) console.log(message);
      if (!facts.some(fact => fact.scope === "profile:travel-budget")) console.log("No budget value was released; only the on-chain spending allowance is enforced.");
    };
    await validateContext();
    const amount = centsToTestUnits(record.amountMinor);
    if (amount <= 0n) throw new Error("Payment amount must be positive");
    const paymentStatus = Number(await contract.checkPayment!(id, signer.address, permission.paymentRecipient, amount));
    if (paymentStatus !== 0 && paymentStatus !== 10) throw new Error(`Payment blocked: ${CHAIN_STATUS[paymentStatus]}`);
    if (paymentStatus === 10) {
      const deadline = record.deadline ?? (process.env.AEGIS_PAYMENT_DEADLINE ? Number(process.env.AEGIS_PAYMENT_DEADLINE) : Math.min(Math.floor(Date.now() / 1000) + 600, Number(permission.expiresAt)));
      if (!Number.isSafeInteger(deadline) || deadline <= Math.floor(Date.now() / 1000)) throw new Error("Invalid or expired payment deadline");
      record = { ...record, deadline }; journal.save(record);
      console.log(`Approval deadline: ${deadline}. It is preserved in the payment journal on retry.`);
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
      // The owner may update private constraints while deciding the approval.
      await validateContext();
    }
    // Simulation is advisory. pay itself atomically rechecks revocation, budgets, balance and replay.
    await contract.pay!.staticCall(id, permission.paymentRecipient, amount, requestId);
    const gas = await contract.pay!.estimateGas(id, permission.paymentRecipient, amount, requestId) * 120n / 100n;
    if (gas > 1_500_000n) throw new Error("Gas limit exceeded");
    const tx = await contract.pay!(id, permission.paymentRecipient, amount, requestId, { gasLimit: gas });
    record = { ...record, transactionHash: tx.hash }; journal.save(record);
    console.log(`Payment submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt?.status !== 1) throw new Error("Payment reverted");
    journal.save({ ...record, confirmed: true });
    console.log(`Test-token payment confirmed: ${tx.hash}. No airline reservation was made.`);
  } finally { try { journal?.close(); } finally { provider.destroy(); } }
}
