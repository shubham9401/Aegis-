import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { Contract, JsonRpcProvider } from 'ethers';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = (file) => fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
const web = env(path.join(root, 'apps/web/.env.local')), agent = env(path.join(root, '.env.local'));
let missing = false;
function check(label, ok) { console.log(`${ok ? 'OK' : 'NEEDS SETUP'}: ${label}`); missing ||= !ok; }
check('Node 24 or later', Number(process.versions.node.split('.')[0]) >= 24);
check('Contract mode selected in both configurations', web.NEXT_PUBLIC_ADAPTER === 'contract' && agent.NEXT_PUBLIC_ADAPTER === 'contract');
for (const key of ['AEGIS_CONTRACT_ADDRESS', 'AEGIS_RESOURCE_SCOPE', 'AEGIS_APP_ORIGIN', 'AEGIS_DEMO_AGENT_TOKEN']) check(`${key} matches across app and agent`, Boolean(web[key]) && web[key] === agent[key]);
check('Server vault encryption key configured', Buffer.from(web.VAULT_SERVER_KEY || '', 'base64').length === 32);
check('Server Kimi key configured (value not displayed)', Boolean(web.KIMI_API_KEY?.trim()));
check('Merchant public address configured', /^0x[0-9a-fA-F]{40}$/.test(web.AEGIS_MERCHANT_ADDRESS || ''));
check('Permission ID configured after grant', /^[1-9]\d*$/.test(agent.AEGIS_PERMISSION_ID || ''));
const keystore = agent.AEGIS_AGENT_KEYSTORE_PATH;
check('Encrypted agent keystore exists', Boolean(keystore && fs.existsSync(keystore)));
if (keystore && fs.existsSync(keystore)) {
  const json = JSON.parse(fs.readFileSync(keystore, 'utf8'));
  check('Keystore public address matches agent signer', ('0x' + String(json.address).replace(/^0x/, '')).toLowerCase() === agent.AEGIS_AGENT_ADDRESS?.toLowerCase());
  const relative = path.relative(root, path.resolve(keystore));
  check('Keystore is outside Git checkout', relative.startsWith('..' + path.sep) || path.isAbsolute(relative));
}
if (!process.argv.includes('--offline') && web.AEGIS_CONTRACT_ADDRESS) {
  const provider = new JsonRpcProvider(web.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz', 10143, { batchMaxCount: 1 });
  try {
    check('Monad testnet RPC', (await provider.getNetwork()).chainId === 10143n);
    const abi = JSON.parse(fs.readFileSync(path.join(root, 'contracts/artifacts/AegisPermissions.abi.json'), 'utf8'));
    const contract = new Contract(web.AEGIS_CONTRACT_ADDRESS, abi, provider);
    check('Deployed contract supports current action bits', await contract.ALL_ACTIONS() === 63n);
    const registry = new Contract(await contract.identityRegistry(), ['function ownerOf(uint256) view returns(address)'], provider);
    if (/^\d+$/.test(agent.AEGIS_AGENT_ID || '')) {
      check('Configured agent is current ERC-8004 owner', (await registry.ownerOf(agent.AEGIS_AGENT_ID)).toLowerCase() === agent.AEGIS_AGENT_ADDRESS?.toLowerCase());
    }
    if (/^0x[0-9a-fA-F]{40}$/.test(agent.AEGIS_AGENT_ADDRESS || '')) check('Agent has test MON for gas', await provider.getBalance(agent.AEGIS_AGENT_ADDRESS) > 0n);
  } catch { check('Live contract/registry lookup (check public configuration and RPC)', false); }
  finally { provider.destroy(); }
}
console.log('A configured key is not proof of provider balance. Physical passkeys and actual testnet receipts still require a live rehearsal.');
process.exitCode = missing ? 1 : 0;
