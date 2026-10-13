import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { Contract, JsonRpcProvider, Wallet, getAddress, hexlify, randomBytes } from "ethers";
import {
  CONTRACT_DATA_ACTION,
  type Address,
  type Bytes32,
  type ContextProofProvider,
} from "@aegis/sdk";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const dataRequestTypes: Record<string, Array<{ name: string; type: string }>> = {
  DataRequest: [
    { name: "permissionId", type: "uint256" },
    { name: "scope", type: "bytes32" },
    { name: "action", type: "uint256" },
    { name: "requestId", type: "bytes32" },
    { name: "deadline", type: "uint64" },
    { name: "audience", type: "string" },
  ],
};

export interface AgentRuntime {
  contextProofProvider: ContextProofProvider;
  paymentPolicy(permissionId: string): Promise<{ recipient: Address; spendingLimitMinor: bigint }>;
  pay(input: { permissionId: string; requestId: Bytes32; recipient: Address; amountMinor: string }): Promise<string>;
}

/** Load the external encrypted ERC-8004 owner once for signed gateway requests and payments. */
export async function createAgentRuntime(): Promise<AgentRuntime> {
  const keystorePath = externalKeystore(required("AEGIS_AGENT_KEYSTORE_PATH"));
  const configuredActor = getAddress(required("AEGIS_AGENT_ADDRESS")) as Address;
  const verifyingContract = getAddress(required("AEGIS_CONTRACT_ADDRESS"));
  const resourceScope = bytes32(required("AEGIS_RESOURCE_SCOPE"));
  const audience = process.env.AEGIS_APP_ORIGIN?.trim() || "http://localhost:3000";
  const password = await promptHidden("Agent keystore password: ");
  const wallet = await Wallet.fromEncryptedJson(fs.readFileSync(keystorePath, "utf8"), password);
  if (getAddress(wallet.address) !== configuredActor) {
    throw new Error("Agent keystore does not match AEGIS_AGENT_ADDRESS");
  }

  const rpcUrl = process.env.MONAD_RPC_URL?.trim() || process.env.NEXT_PUBLIC_RPC_URL?.trim() || "https://testnet-rpc.monad.xyz";
  const provider = new JsonRpcProvider(rpcUrl, 10143, { staticNetwork: true });
  const signer = wallet.connect(provider);
  const contract = new Contract(verifyingContract, [
    "function getPermission(uint256 id) view returns (tuple(address user,address issuer,address agent,address paymentRecipient,uint256 agentId,uint256 parentId,uint256 rootId,bytes32 scope,uint256 actions,uint256 spendingLimit,uint256 spent,uint256 approvedSpent,uint64 expiresAt,uint8 depth,bool canDelegate,bool revoked))",
    "function pay(uint256 id,address recipient,uint256 amount,bytes32 requestId)",
  ], signer);
  const contextProofProvider: ContextProofProvider = async (request) => {
    if (!request.permissionId || !/^[1-9]\d*$/.test(request.permissionId)) {
      throw new Error("A positive numeric permissionId is required for a signed context request");
    }
    const requestId = hexlify(randomBytes(32)) as Bytes32;
    const deadline = Math.floor(Date.now() / 1000) + 60;
    const signature = await signer.signTypedData(
      {
        name: "AegisDataGateway",
        version: "1",
        chainId: 10143,
        verifyingContract,
      },
      dataRequestTypes,
      {
        permissionId: BigInt(request.permissionId),
        scope: resourceScope,
        action: CONTRACT_DATA_ACTION[request.scope],
        requestId,
        deadline,
        audience,
      },
    );
    return { requestId, deadline, signature: signature as `0x${string}` };
  };

  return {
    contextProofProvider,
    async paymentPolicy(permissionId) {
      if (!/^[1-9]\d*$/.test(permissionId)) throw new Error("A positive numeric permissionId is required for payment");
      const permission = await contract.getFunction("getPermission")(BigInt(permissionId));
      return {
        recipient: getAddress(permission.paymentRecipient) as Address,
        spendingLimitMinor: BigInt(permission.spendingLimit) / 10_000n,
      };
    },
    async pay({ permissionId, requestId, recipient, amountMinor }) {
      if (!/^[1-9]\d*$/.test(permissionId)) throw new Error("A positive numeric permissionId is required for payment");
      if (!/^0x[a-fA-F0-9]{64}$/.test(requestId)) throw new Error("Payment requestId must be bytes32");
      const amount = BigInt(amountMinor) * 10_000n;
      const transaction = await contract.getFunction("pay")(BigInt(permissionId), getAddress(recipient), amount, requestId);
      const receipt = await transaction.wait();
      if (!receipt || receipt.status !== 1) throw new Error("The Aegis payment transaction reverted");
      return receipt.hash;
    },
  };
}

/** Backward-compatible helper for consumers that only need context proofs. */
export async function createAgentContextProofProvider(): Promise<ContextProofProvider> {
  return (await createAgentRuntime()).contextProofProvider;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in contract mode`);
  return value;
}

function bytes32(value: string): Bytes32 {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) throw new Error("AEGIS_RESOURCE_SCOPE must be bytes32");
  return value as Bytes32;
}

function externalKeystore(value: string): string {
  const resolved = path.resolve(value);
  const relative = path.relative(repositoryRoot, resolved);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error("AEGIS_AGENT_KEYSTORE_PATH must point outside the repository");
  }
  if (!fs.existsSync(resolved)) throw new Error(`Agent keystore not found: ${resolved}`);
  return resolved;
}

async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("A TTY is required to enter the agent keystore password privately");
  }
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const hidden = rl as typeof rl & {
      stdoutMuted: boolean;
      _writeToOutput: (text: string) => void;
    };
    const originalWrite = hidden._writeToOutput.bind(rl);
    hidden._writeToOutput = (text) => {
      if (hidden.stdoutMuted) process.stdout.write("*");
      else originalWrite(text);
    };
    hidden.stdoutMuted = false;
    rl.question(question, (answer) => {
      hidden.stdoutMuted = false;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
    hidden.stdoutMuted = true;
    rl.on("SIGINT", () => reject(new Error("Cancelled")));
  });
}
