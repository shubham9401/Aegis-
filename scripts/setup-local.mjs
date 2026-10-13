// Creates ignored configuration. Never prints secret values or overwrites an existing value.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const find = (text, key) => text.split(/\r?\n/).find((line) => line.startsWith(key + '='))?.slice(key.length + 1).trim();
const webFile = path.join(root, 'apps/web/.env.local'), agentFile = path.join(root, '.env.local');
const web = read(webFile), agent = read(agentFile);
const deployment = JSON.parse(read(path.join(root, 'contracts/deployments/monad-testnet.json')));
const random = () => crypto.randomBytes(32).toString('hex');
const token = find(web, 'AEGIS_DEMO_AGENT_TOKEN') || find(agent, 'AEGIS_DEMO_AGENT_TOKEN') || random();
const scope = find(web, 'AEGIS_RESOURCE_SCOPE') || find(agent, 'AEGIS_RESOURCE_SCOPE') || '0x' + random();
const common = { NEXT_PUBLIC_ADAPTER: 'contract', AEGIS_CONTRACT_ADDRESS: deployment.aegisAddress, AEGIS_RESOURCE_SCOPE: scope,
  AEGIS_APP_ORIGIN: 'http://localhost:3000', AEGIS_AGENT_ID: '2088', AEGIS_AGENT_ADDRESS: '0x5d4a8bd54999A12183AAD386537d71F71668ea2B',
  AEGIS_DEMO_AGENT_TOKEN: token, MONAD_RPC_URL: 'https://testnet-rpc.monad.xyz' };
function appendMissing(file, text, values) {
  const additions = Object.entries(values).filter(([key]) => find(text, key) === undefined).map(([key, value]) => `${key}=${value}`).join('\n');
  if (additions) fs.appendFileSync(file, (text.endsWith('\n') || !text ? '' : '\n') + additions + '\n', { mode: 0o600 });
}
appendMissing(webFile, web, { ...common, NEXT_PUBLIC_RPC_URL: common.MONAD_RPC_URL,
  VAULT_SERVER_KEY: crypto.randomBytes(32).toString('base64'), KIMI_API_KEY: '', KIMI_MODEL: 'kimi-k2.6', AEGIS_MERCHANT_ADDRESS: '' });
appendMissing(agentFile, agent, { ...common, AEGIS_WEB_URL: 'http://localhost:3000', AEGIS_AGENT_KEYSTORE_PATH: '', AEGIS_PERMISSION_ID: '' });
console.log('Created missing local configuration values without replacing existing values. Secret values were not printed.');
console.log('Set the merchant public address, server KIMI_API_KEY, and agent keystore path. Grant a permission in the dashboard, then set its numeric ID in the agent configuration.');
for (const [key, desired] of Object.entries(common)) {
  const left = find(read(webFile), key), right = find(read(agentFile), key);
  if (left !== right) console.log(`Configuration mismatch: ${key}. Reconcile the two .env.local files.`);
  if (['NEXT_PUBLIC_ADAPTER', 'AEGIS_CONTRACT_ADDRESS'].includes(key) && left !== desired) console.log(`Review existing ${key}; it was preserved.`);
}
