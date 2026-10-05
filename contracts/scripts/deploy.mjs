import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Contract, ContractFactory, FetchRequest, JsonRpcProvider, Wallet, getAddress, formatEther } from 'ethers';
import { compile, root } from './compile.mjs';

const CHAIN_ID = 10143n;
const registryAddress = getAddress(process.env.IDENTITY_REGISTRY_ADDRESS || '0x8004A818BFB912233c491871b3d84c89A494BD9e');
const rpcUrl = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const transport = new FetchRequest(rpcUrl);
transport.timeout = 15000;
// Monad Foundation public RPC does not accept JSON-RPC batches.
const provider = new JsonRpcProvider(transport, undefined, { batchMaxCount: 1 });
provider.pollingInterval = 1500;
const deployments = path.join(root, 'deployments');
fs.mkdirSync(deployments, { recursive: true });
const manifestPath = path.join(deployments, 'monad-testnet.json');

function save(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n');
}

function readPassword() {
  if (!process.stdin.isTTY) throw new Error('Run deployment in an interactive terminal for the hidden keystore password prompt.');
  return new Promise((resolve, reject) => {
    process.stdout.write('Keystore password (hidden): ');
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let secret = '';
    const finish = () => {
      process.stdin.off('keypress', handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const handler = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') { finish(); reject(new Error('Deployment cancelled')); }
      else if (key.name === 'return' || key.name === 'enter') { finish(); resolve(secret); }
      else if (key.name === 'backspace') secret = secret.slice(0, -1);
      else if (str && !key.ctrl && !key.meta) secret += str;
    };
    process.stdin.on('keypress', handler);
  });
}

async function main() {
  const chain = await provider.getNetwork();
  if (chain.chainId !== CHAIN_ID) throw new Error('Wrong network: this script deploys only to Monad testnet (10143).');
  const registryCode = await provider.getCode(registryAddress);
  if (registryCode === '0x') throw new Error('No identity registry bytecode. Refusing to substitute a mock registry.');
  const registry = new Contract(registryAddress, ['function supportsInterface(bytes4) view returns (bool)'], provider);
  if (!await registry.supportsInterface('0x80ac58cd')) throw new Error('Registry does not advertise ERC-721.');
  const suppliedAddress = process.env.DEPLOYER_ADDRESS ? getAddress(process.env.DEPLOYER_ADDRESS) : null;
  const report = {
    checkedAt: new Date().toISOString(), chainId: Number(chain.chainId),
    blockNumber: await provider.getBlockNumber(), registryAddress,
    registryBytecodePresent: true, registrySupportsERC721: true,
    registrySource: 'https://github.com/erc-8004/erc-8004-contracts#monad-testnet',
    deployerAddress: suppliedAddress,
    deployerBalanceMON: suppliedAddress ? formatEther(await provider.getBalance(suppliedAddress)) : null,
    aegisDeployedByThisCheck: false,
  };
  save(path.join(deployments, 'monad-testnet.preflight.json'), report);
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--preflight')) return;

  const keystorePath = process.env.DEPLOYER_KEYSTORE_PATH;
  if (!keystorePath) throw new Error('No deployment wallet configured. Set DEPLOYER_KEYSTORE_PATH to an encrypted JSON keystore; never paste keys in chat.');
  const resolvedKey = path.resolve(keystorePath);
  if (resolvedKey.startsWith(root + path.sep)) throw new Error('Store the deployment keystore outside this shareable package.');
  const artifacts = compile();
  let wallet = Wallet.fromEncryptedJsonSync(fs.readFileSync(resolvedKey, 'utf8'), await readPassword()).connect(provider);
  if (suppliedAddress && wallet.address !== suppliedAddress) throw new Error('Keystore does not match DEPLOYER_ADDRESS.');
  let manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  if (manifest.aegisAddress) throw new Error('Aegis deployment is already recorded; review the manifest before deploying again.');
  if (manifest.aegisTransactionHash || (manifest.tokenTransactionHash && !manifest.paymentTokenAddress)) {
    throw new Error('A previously submitted deployment needs receipt recovery. Inspect its transaction hash; do not blindly deploy again.');
  }
  if (manifest.identityRegistryAddress && manifest.identityRegistryAddress !== registryAddress) throw new Error('Registry differs from existing deployment manifest.');
  if (manifest.deployer && manifest.deployer !== wallet.address) throw new Error('Deployer differs from existing partial deployment.');
  let tokenAddress = process.env.PAYMENT_TOKEN_ADDRESS || manifest.paymentTokenAddress || null;
  if (tokenAddress) tokenAddress = getAddress(tokenAddress);
  if (manifest.paymentTokenAddress && tokenAddress !== manifest.paymentTokenAddress) throw new Error('Token differs from recorded partial deployment.');
  if (tokenAddress && await provider.getCode(tokenAddress) === '0x') throw new Error('Configured payment token has no bytecode.');
  const fee = await provider.getFeeData();
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
  if (!gasPrice) throw new Error('Could not obtain a gas price.');
  // Conservative native-token reserve; actual requirement is calculated from estimateGas.
  const aegisFactory = new ContractFactory(artifacts.AegisPermissions.abi, artifacts.AegisPermissions.bytecode, wallet);
  const tokenFactory = new ContractFactory(artifacts.MockUSD.abi, artifacts.MockUSD.bytecode, wallet);
  // Before a new token exists, exact Aegis constructor estimation is impossible (code check).
  // Use the known conservative 6M gas ceiling, then estimate exactly after token deployment.
  const tokenGas = tokenAddress ? 0n : await provider.estimateGas({ ...await tokenFactory.getDeployTransaction(), from: wallet.address });
  const reserve = (6000000n + tokenGas) * gasPrice * 12n / 10n;
  const balance = await provider.getBalance(wallet.address);
  if (balance < reserve) throw new Error(`Deployment wallet needs test MON. Balance ${formatEther(balance)}; conservative reserve ${formatEther(reserve)}. Faucet: https://faucet.monad.xyz`);
  manifest = { ...manifest, chainId: Number(CHAIN_ID), network: 'monad-testnet', deployer: wallet.address,
    identityRegistryAddress: registryAddress, status: 'deploying', updatedAt: new Date().toISOString() };
  save(manifestPath, manifest);
  if (!tokenAddress) {
    const token = await tokenFactory.deploy();
    manifest.tokenTransactionHash = token.deploymentTransaction().hash;
    save(manifestPath, manifest);
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
    manifest.paymentTokenAddress = tokenAddress;
    manifest.paymentTokenIsDemo = true;
    save(manifestPath, manifest);
  } else {
    manifest.paymentTokenAddress = tokenAddress;
    manifest.paymentTokenIsDemo ??= false;
  }
  const token = new Contract(tokenAddress, ['function decimals() view returns (uint8)', 'function symbol() view returns (string)'], provider);
  manifest.paymentTokenDecimals = Number(await token.decimals());
  manifest.paymentTokenSymbol = await token.symbol();
  const tx = await aegisFactory.getDeployTransaction(registryAddress, tokenAddress);
  const gas = await provider.estimateGas({ ...tx, from: wallet.address });
  const aegis = await aegisFactory.deploy(registryAddress, tokenAddress, { gasLimit: gas * 12n / 10n });
  manifest.aegisTransactionHash = aegis.deploymentTransaction().hash;
  save(manifestPath, manifest);
  await aegis.waitForDeployment();
  manifest.aegisAddress = await aegis.getAddress();
  manifest.status = 'deployed';
  manifest.updatedAt = new Date().toISOString();
  manifest.abiPath = 'artifacts/AegisPermissions.abi.json';
  manifest.compiler = artifacts.AegisPermissions.compiler;
  save(manifestPath, manifest);
  console.log(JSON.stringify(manifest, null, 2));
  wallet = null;
}

try { await main(); }
catch (error) {
  // Do not dump provider request objects: custom RPC URLs may contain API credentials.
  console.error(error.shortMessage || error.message || 'Deployment failed');
  process.exitCode = 1;
} finally { provider.destroy(); }
