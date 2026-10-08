import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
  formatEther,
  getAddress,
} from "ethers";

import { root } from "./compile.mjs";

const MONAD_TESTNET_CHAIN_ID = 10143n;
const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";
const DEFAULT_IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const ERC721_INTERFACE_ID = "0x80ac58cd";

const registryAbi = [
  "function register(string agentURI) returns (uint256 agentId)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

function fail(message) {
  throw new Error(message);
}

function readRequired(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function validateLabel(value) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    fail("AGENT_LABEL must contain only lowercase letters, numbers, and hyphens (max 64 characters).");
  }
  return value;
}

function validateAgentUri(value) {
  if (value.length > 4096) fail("AGENT_URI must be 4096 characters or fewer.");
  const allowed =
    value.startsWith("https://") ||
    value.startsWith("ipfs://") ||
    value.startsWith("data:application/json;base64,");
  if (!allowed) {
    fail("AGENT_URI must use https://, ipfs://, or data:application/json;base64,.");
  }
  return value;
}

function makeProvider(rpcUrl) {
  const request = new FetchRequest(rpcUrl);
  request.timeout = 15_000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
}

async function promptHidden(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail("A TTY is required so the keystore password can be entered privately.");
  }

  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin;
    const originalWrite = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (text) => {
      if (rl.stdoutMuted) rl.output.write("*");
      else originalWrite(text);
    };

    rl.stdoutMuted = false;
    rl.question(question, (answer) => {
      rl.stdoutMuted = false;
      rl.output.write("\n");
      rl.close();
      resolve(answer);
    });
    rl.stdoutMuted = true;
    rl.on("SIGINT", () => {
      stdin.pause();
      reject(new Error("Cancelled."));
    });
  });
}

function ensureExternalKeystore(keystorePath) {
  const resolved = path.resolve(keystorePath);
  const relative = path.relative(root, resolved);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    fail("AGENT_KEYSTORE_PATH must point outside the repository.");
  }
  if (!fs.existsSync(resolved)) fail(`Keystore not found: ${resolved}`);
  return resolved;
}

async function verifyRegistry(provider, registryAddress) {
  const network = await provider.getNetwork();
  if (network.chainId !== MONAD_TESTNET_CHAIN_ID) {
    fail(`Refusing chain ${network.chainId}; expected Monad testnet ${MONAD_TESTNET_CHAIN_ID}.`);
  }

  const bytecode = await provider.getCode(registryAddress);
  if (bytecode === "0x") fail(`No contract found at identity registry ${registryAddress}.`);

  const registry = new Contract(registryAddress, registryAbi, provider);
  const supportsErc721 = await registry.supportsInterface(ERC721_INTERFACE_ID);
  if (!supportsErc721) fail("Configured identity registry does not report ERC-721 support.");

  return registry;
}

function manifestPathFor(label) {
  return path.join(root, "deployments", "agents", `${label}.json`);
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function writeManifest(manifestPath, value) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const temporaryPath = `${manifestPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "w" });
  fs.renameSync(temporaryPath, manifestPath);
}

function registeredEventFromReceipt(registry, receipt) {
  for (const log of receipt.logs) {
    try {
      if (getAddress(log.address) !== getAddress(String(registry.target))) continue;
      const parsed = registry.interface.parseLog(log);
      if (parsed?.name === "Registered") return parsed.args;
    } catch {
      // Ignore logs from other contracts.
    }
  }
  return null;
}

async function recoverPendingRegistration(provider, registry, manifest, manifestPath) {
  if (!manifest?.transactionHash || manifest.agentId !== undefined) return false;
  const receipt = await provider.getTransactionReceipt(manifest.transactionHash);
  if (!receipt) {
    fail(`Registration transaction ${manifest.transactionHash} is still pending. Refusing to submit a duplicate.`);
  }
  if (receipt.status !== 1) {
    fail(`Registration transaction ${manifest.transactionHash} failed. Inspect it before retrying.`);
  }

  const event = registeredEventFromReceipt(registry, receipt);
  if (!event) fail("Registration succeeded but its Registered event could not be decoded.");
  const recoveredOwner = getAddress(event.owner);
  if (manifest.owner && getAddress(manifest.owner) !== recoveredOwner) {
    fail("Recovered registration owner does not match the pending manifest.");
  }
  if (manifest.agentUri && manifest.agentUri !== event.agentURI) {
    fail("Recovered registration URI does not match the pending manifest.");
  }

  writeManifest(manifestPath, {
    ...manifest,
    agentId: event.agentId.toString(),
    owner: recoveredOwner,
    agentUri: event.agentURI,
    blockNumber: receipt.blockNumber,
    status: "registered",
  });
  console.log(`Recovered agent ${event.agentId} from ${manifest.transactionHash}.`);
  return true;
}

async function main() {
  const preflightOnly = process.argv.includes("--preflight");
  const label = validateLabel(process.env.AGENT_LABEL?.trim() || "travel-agent");
  const rpcUrl = process.env.MONAD_RPC_URL?.trim() || DEFAULT_RPC_URL;
  const registryAddress = getAddress(
    process.env.IDENTITY_REGISTRY_ADDRESS?.trim() || DEFAULT_IDENTITY_REGISTRY,
  );
  const configuredAddress = process.env.AGENT_ADDRESS?.trim()
    ? getAddress(process.env.AGENT_ADDRESS.trim())
    : null;

  const provider = makeProvider(rpcUrl);
  const registry = await verifyRegistry(provider, registryAddress);

  console.log(`Monad testnet: ${MONAD_TESTNET_CHAIN_ID}`);
  console.log(`ERC-8004 registry: ${registryAddress}`);
  console.log(`Agent label: ${label}`);
  if (configuredAddress) {
    const balance = await provider.getBalance(configuredAddress);
    console.log(`Agent address: ${configuredAddress}`);
    console.log(`Balance: ${formatEther(balance)} MON`);
  }

  if (preflightOnly) {
    console.log("Preflight passed. No transaction was sent.");
    return;
  }

  const agentUri = validateAgentUri(readRequired("AGENT_URI"));
  const keystorePath = ensureExternalKeystore(readRequired("AGENT_KEYSTORE_PATH"));
  const manifestPath = manifestPathFor(label);
  const existing = readManifest(manifestPath);
  if (existing?.agentId !== undefined) {
    fail(`Agent ${label} is already recorded as ERC-8004 ID ${existing.agentId}.`);
  }
  if (await recoverPendingRegistration(provider, registry, existing, manifestPath)) return;

  const password = await promptHidden("Keystore password: ");
  const wallet = await Wallet.fromEncryptedJson(fs.readFileSync(keystorePath, "utf8"), password);
  const signer = wallet.connect(provider);
  const owner = getAddress(wallet.address);
  if (configuredAddress && owner !== configuredAddress) {
    fail(`Keystore address ${owner} does not match AGENT_ADDRESS ${configuredAddress}.`);
  }

  const connected = registry.connect(signer);
  const feeData = await provider.getFeeData();
  const gasLimit = await connected.register.estimateGas(agentUri);
  const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!feePerGas) fail("RPC did not return a usable gas price.");
  const requiredBalance = gasLimit * feePerGas;
  const balance = await provider.getBalance(owner);
  if (balance < requiredBalance) {
    fail(`Agent wallet has ${formatEther(balance)} MON; estimated registration requires ${formatEther(requiredBalance)} MON.`);
  }

  const transaction = await connected.register(agentUri);
  writeManifest(manifestPath, {
    chainId: MONAD_TESTNET_CHAIN_ID.toString(),
    registryAddress,
    label,
    owner,
    agentUri,
    transactionHash: transaction.hash,
    status: "pending",
  });
  console.log(`Submitted: ${transaction.hash}`);

  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) fail("Registration transaction failed.");
  const event = registeredEventFromReceipt(registry, receipt);
  if (!event) fail("Registered event was not found in the transaction receipt.");

  const agentId = event.agentId;
  const recordedOwner = getAddress(await registry.ownerOf(agentId));
  const recordedUri = await registry.tokenURI(agentId);
  if (recordedOwner !== owner || recordedUri !== agentUri) {
    fail("Registry state does not match the submitted owner and agent URI.");
  }

  writeManifest(manifestPath, {
    chainId: MONAD_TESTNET_CHAIN_ID.toString(),
    registryAddress,
    label,
    agentId: agentId.toString(),
    owner,
    agentUri,
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
    status: "registered",
  });
  console.log(`Registered ${label} as ERC-8004 agent ${agentId}.`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
