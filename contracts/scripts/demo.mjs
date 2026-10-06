import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { compile, root } from './compile.mjs';
import { fixture, units, requestId, Status } from '../test/fixture.mjs';

const artifacts = compile({ quiet: true });
const f = await fixture(artifacts);
const steps = [];
function record(step, result) { steps.push({ step, result }); console.log(`${step}: ${result}`); }
async function mustRevert(transaction, label) {
  try { const tx = await transaction; await tx.wait(); }
  catch (error) { if (error.code !== 'CALL_EXCEPTION') throw error; record(label, 'REVERTED on local EVM'); return; }
  throw new Error(`${label} unexpectedly succeeded`);
}

try {
  const parent = await f.grant();
  record('User grants agent A 500 test USD allowance', `permission ${parent}`);
  const child = await f.child(parent, { actions: 11n });
  record('A delegates diet, destination and 100 test USD to B', `permission ${child}`);
  assert.equal(await f.aegis.checkPermission(child, f.addresses[2], 1n, f.scope), Status.Allowed);
  await (await f.aegis.connect(f.agentB).usePermission(child, 1n, f.scope, requestId())).wait();
  record('B requests dietary preference', 'AUTHORIZED; no private data stored or decrypted by this contract');
  assert.equal(await f.aegis.checkPermission(child, f.addresses[2], 4n, f.scope), Status.ActionNotAllowed);
  record('B requests itinerary', 'DENIED: ActionNotAllowed');
  await mustRevert(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(101), requestId(), { gasLimit: 700000 }), 'B attempts 101 test USD payment');
  await (await f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(80), requestId())).wait();
  assert.equal((await f.aegis.getPermission(parent)).spent, units(80));
  record('B pays 80 test USD', 'TRANSFERRED; remaining automatic allowance A=420, B=20');
  const req = requestId();
  await (await f.aegis.approvePayment(child, req, f.addresses[3], units(650), f.expiry - 100)).wait();
  await (await f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(650), req)).wait();
  record('Owner approves one extra 650 test USD payment', 'TRANSFERRED once; automatic allowances remain A=420, B=20');
  await mustRevert(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(650), req, { gasLimit: 700000 }), 'B replays approved payment');
  await (await f.aegis.revokePermission(parent)).wait();
  assert.equal(await f.aegis.checkPermission(child, f.addresses[2], 1n, f.scope), Status.Revoked);
  record('User revokes A; B repeats dietary request', 'DENIED: Revoked');
  await mustRevert(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(1), requestId(), { gasLimit: 700000 }), 'B pays after parent revocation');
  const report = {
    executedAt: new Date().toISOString(), network: 'in-memory local EVM', chainId: 31337,
    deploymentStatus: 'NOT deployed to Monad testnet',
    authentication: 'Local test signers; passkey UI is teammate 2 work',
    data: 'Synthetic scope only; gateway/encryption implementation is teammate 2/3 work',
    steps,
  };
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(root, 'reports', 'local-demo.json'), JSON.stringify(report, null, 2) + '\n');
} finally { await f.close(); }
