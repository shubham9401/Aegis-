import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { Wallet, getAddress, hexlify, randomBytes } from "ethers";
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

/** Load an external encrypted agent wallet and create one-use context proofs. */
export async function createAgentContextProofProvider(): Promise<ContextProofProvider> {
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

  return async (request) => {
    if (!request.permissionId || !/^[1-9]\d*$/.test(request.permissionId)) {
      throw new Error("A positive numeric permissionId is required for a signed context request");
    }
    const requestId = hexlify(randomBytes(32)) as Bytes32;
    const deadline = Math.floor(Date.now() / 1000) + 60;
    const signature = await wallet.signTypedData(
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
