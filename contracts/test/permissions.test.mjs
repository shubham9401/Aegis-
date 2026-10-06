import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../scripts/compile.mjs';
import { fixture, units, requestId, Status, ZeroAddress } from './fixture.mjs';

let artifacts;
before(() => { artifacts = compile({ quiet: true }); });
async function setup(t) { const f = await fixture(artifacts); t.after(f.close); return f; }
async function denied(call) {
  await assert.rejects(call, error => error.code === 'CALL_EXCEPTION');
}

test('grants identify the user and registry owner; checks reject wrong identity, scope and action', async t => {
  const f = await setup(t), id = await f.grant();
  const p = await f.aegis.getPermission(id);
  assert.equal(p.user, f.addresses[0]); assert.equal(p.agent, f.addresses[1]);
  assert.equal(p.agentId, 0n); // ERC-8004 token ID zero is valid.
  assert.equal(await f.aegis.checkPermission(id, f.addresses[1], 1n, f.scope), Status.Allowed);
  assert.equal(await f.aegis.checkPermission(id, f.addresses[2], 1n, f.scope), Status.WrongAgent);
  assert.equal(await f.aegis.checkPermission(id, f.addresses[1], 1n, requestId()), Status.WrongScope);
  assert.equal(await f.aegis.checkPermission(id, f.addresses[1], 3n, f.scope), Status.InvalidAction);
  assert.equal(await f.aegis.permissionStatus(999), Status.NotFound);
  await denied(f.aegis.connect(f.stranger).revokePermission(id));
  await denied(f.grant({ agentId: 999n }));
});

test('invalid grants cannot create open-ended scope, unknown actions, or invalid payment recipients', async t => {
  const f = await setup(t);
  for (const invalid of [{ scope: '0x' + '00'.repeat(32) }, { actions: 0n }, { actions: 16n },
    { expiresAt: f.now }, { paymentRecipient: ZeroAddress },
    { actions: 1n, spendingLimit: 0n }, { paymentRecipient: await f.aegis.getAddress() }]) {
    await denied(f.grant(invalid));
  }
  const id = await f.grant({ actions: 1n, spendingLimit: 0n, paymentRecipient: ZeroAddress });
  assert.equal(await f.aegis.permissionStatus(id), Status.Allowed);
});

test('delegation permits only narrower actions, budgets, expiry and approved depth', async t => {
  const f = await setup(t), parent = await f.grant({ actions: 11n });
  const child = await f.child(parent, { actions: 3n, spendingLimit: 0n });
  assert.equal(await f.aegis.checkPermission(child, f.addresses[2], 1n, f.scope), Status.Allowed);
  assert.equal(await f.aegis.checkPermission(child, f.addresses[2], 4n, f.scope), Status.ActionNotAllowed);
  await denied(f.child(parent, { actions: 15n }));
  await denied(f.child(parent, { spendingLimit: units(501) }));
  await denied(f.child(parent, { expiresAt: f.expiry + 1 }));
  await denied(f.aegis.connect(f.stranger).delegatePermission(parent, 1n, 1n, 0n, f.expiry, false));
  await denied(f.aegis.connect(f.agentB).delegatePermission(child, 2n, 1n, 0n, f.expiry - 60, false));
  const noDelegate = await f.grant({ canDelegate: false });
  await denied(f.child(noDelegate));
});

test('revoking a parent blocks child reads, spending and further delegation', async t => {
  const f = await setup(t), parent = await f.grant(), child = await f.child(parent, { canDelegate: true });
  await (await f.aegis.revokePermission(parent)).wait();
  assert.equal((await f.aegis.getPermission(child)).revoked, false);
  assert.equal(await f.aegis.permissionStatus(child), Status.Revoked);
  await denied(f.aegis.connect(f.agentB).usePermission(child, 1n, f.scope, requestId()));
  await denied(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(1), requestId()));
  await denied(f.aegis.connect(f.agentB).delegatePermission(child, 2n, 1n, 0n, f.expiry - 60, false));
  const unrelated = await f.grant({ agentId: 1n });
  assert.equal(await f.aegis.permissionStatus(unrelated), Status.Allowed);
});

test('child issuer may revoke it without revoking the parent', async t => {
  const f = await setup(t), parent = await f.grant(), child = await f.child(parent);
  await (await f.aegis.connect(f.agentA).revokePermission(child)).wait();
  assert.equal(await f.aegis.permissionStatus(child), Status.Revoked);
  assert.equal(await f.aegis.permissionStatus(parent), Status.Allowed);
});

test('expiry is enforced for reads and payments at the exact expiry boundary', async t => {
  const f = await setup(t), parent = await f.grant(), child = await f.child(parent);
  const expires = Number((await f.aegis.getPermission(child)).expiresAt);
  await f.engine.request({ method: 'evm_setTime', params: [expires * 1000] });
  await f.engine.request({ method: 'evm_mine', params: [] });
  assert.equal(await f.aegis.permissionStatus(child), Status.Expired);
  await denied(f.aegis.connect(f.agentB).pay(child, f.addresses[3], 1n, requestId()));
  assert.equal(await f.aegis.permissionStatus(parent), Status.Allowed);
});

test('registry identity transfer blocks that grant and every descendant while ownership differs', async t => {
  const f = await setup(t), parent = await f.grant(), child = await f.child(parent);
  await (await f.registry.connect(f.agentA).transferFrom(f.addresses[1], f.addresses[4], 0n)).wait();
  assert.equal(await f.aegis.permissionStatus(parent), Status.IdentityChanged);
  assert.equal(await f.aegis.permissionStatus(child), Status.IdentityChanged);
  await denied(f.aegis.connect(f.stranger).pay(parent, f.addresses[3], units(1), requestId()));
});

test('child spending shares the root allowance; a later sibling payment cannot overspend', async t => {
  const f = await setup(t), parent = await f.grant();
  const child = await f.child(parent, { spendingLimit: units(400) });
  const sibling = await f.child(parent, { agentId: 2n, spendingLimit: units(400) });
  await (await f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(300), requestId())).wait();
  assert.equal((await f.aegis.getPermission(parent)).spent, units(300));
  assert.equal(await f.aegis.checkPayment(sibling, f.addresses[5], f.addresses[3], units(201)), Status.BudgetExceeded);
  // Force submission to exercise EVM revert, rather than only a preflight failure.
  const rejected = await f.aegis.connect(f.agentC).pay(sibling, f.addresses[3], units(300), requestId(), { gasLimit: 600000 });
  await denied(rejected.wait());
  assert.equal((await f.aegis.getPermission(sibling)).spent, 0n);
  await (await f.aegis.connect(f.agentC).pay(sibling, f.addresses[3], units(200), requestId())).wait();
  assert.equal((await f.aegis.getPermission(parent)).spent, units(500));
  assert.equal(await f.token.balanceOf(f.addresses[3]), units(500));
  assert.equal(await f.aegis.balances(f.addresses[0]), units(4500));
  await denied(f.aegis.connect(f.agentA).pay(parent, f.addresses[3], 1n, requestId()));
});

test('an exhausted child cannot consume its parent remaining allowance', async t => {
  const f = await setup(t), parent = await f.grant(), child = await f.child(parent);
  await (await f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(100), requestId())).wait();
  await denied(f.aegis.connect(f.agentB).pay(child, f.addresses[3], 1n, requestId()));
  assert.equal(await f.aegis.checkPayment(parent, f.addresses[1], f.addresses[3], units(400)), Status.Allowed);
});

test('payments reject wrong signer, recipient, zero amount, replay and data-call bypass', async t => {
  const f = await setup(t), parent = await f.grant(), req = requestId();
  await denied(f.aegis.connect(f.stranger).pay(parent, f.addresses[3], units(1), req));
  await denied(f.aegis.connect(f.agentA).pay(parent, f.addresses[4], units(1), req));
  await denied(f.aegis.connect(f.agentA).pay(parent, f.addresses[3], 0n, req));
  await denied(f.aegis.connect(f.agentA).usePermission(parent, 8n, f.scope, req));
  await (await f.aegis.connect(f.agentA).pay(parent, f.addresses[3], units(1), req)).wait();
  await denied(f.aegis.connect(f.agentA).pay(parent, f.addresses[3], units(1), req));
  const child = await f.child(parent);
  await denied(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(1), req));
  assert.equal(await f.token.balanceOf(f.addresses[3]), units(1));
});

test('exact one-use owner approval allows extra spending without raising automatic limits', async t => {
  const f = await setup(t), parent = await f.grant(), child = await f.child(parent), req = requestId();
  await denied(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(650), req));
  await denied(f.aegis.connect(f.agentA).approvePayment(child, req, f.addresses[3], units(650), f.expiry - 100));
  await (await f.aegis.approvePayment(child, req, f.addresses[3], units(650), f.expiry - 100)).wait();
  await denied(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(651), req));
  await denied(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(1), req));
  await (await f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(650), req)).wait();
  await denied(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(650), req));
  const root = await f.aegis.getPermission(parent), leaf = await f.aegis.getPermission(child);
  assert.equal(root.spent, 0n); assert.equal(root.approvedSpent, units(650));
  assert.equal(leaf.spendingLimit, units(100)); assert.equal(leaf.approvedSpent, units(650));
  assert.equal(await f.aegis.checkPayment(child, f.addresses[2], f.addresses[3], units(101)), Status.BudgetExceeded);
  assert.equal(await f.token.balanceOf(f.addresses[3]), units(650));
});

test('manual approvals cannot survive parent revocation, expiry, cancellation or pay a different child', async t => {
  const f = await setup(t), parent = await f.grant(), child = await f.child(parent), sibling = await f.child(parent);
  const cancelled = requestId();
  await (await f.aegis.approvePayment(child, cancelled, f.addresses[3], units(650), f.expiry - 100)).wait();
  await (await f.aegis.cancelPaymentApproval(child, cancelled)).wait();
  await denied(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(650), cancelled));
  const req = requestId();
  await (await f.aegis.approvePayment(child, req, f.addresses[3], units(650), f.expiry - 100)).wait();
  await denied(f.aegis.connect(f.agentB).pay(sibling, f.addresses[3], units(650), req));
  await (await f.aegis.revokePermission(parent)).wait();
  await denied(f.aegis.connect(f.agentB).pay(child, f.addresses[3], units(650), req));
  const other = await f.grant(), expiring = requestId();
  await (await f.aegis.approvePayment(other, expiring, f.addresses[3], units(650), f.now + 30)).wait();
  await f.engine.request({ method: 'evm_increaseTime', params: [31] });
  await f.engine.request({ method: 'evm_mine', params: [] });
  await denied(f.aegis.connect(f.agentA).pay(other, f.addresses[3], units(650), expiring));
});

test('only the depositor can withdraw their balance; underfunded payments cannot consume allowance', async t => {
  const f = await setup(t), parent = await f.grant();
  await denied(f.aegis.connect(f.stranger).withdraw(1n, f.addresses[4]));
  await (await f.aegis.withdraw(units(4900), f.addresses[0])).wait();
  assert.equal(await f.aegis.checkPayment(parent, f.addresses[1], f.addresses[3], units(200)), Status.InsufficientBalance);
  await denied(f.aegis.connect(f.agentA).pay(parent, f.addresses[3], units(200), requestId()));
  assert.equal((await f.aegis.getPermission(parent)).spent, 0n);
  assert.equal(await f.aegis.balances(f.addresses[0]), units(100));
});

test('data usage emits an authorization receipt, with replay prevention and no token movement', async t => {
  const f = await setup(t), parent = await f.grant(), req = requestId();
  const receipt = await (await f.aegis.connect(f.agentA).usePermission(parent, 1n, f.scope, req)).wait();
  const event = receipt.logs.map(log => { try { return f.aegis.interface.parseLog(log); } catch { return null; } })
    .find(log => log?.name === 'PermissionUsed');
  assert.equal(event.args.requestId, req); assert.equal(event.args.action, 1n);
  await denied(f.aegis.connect(f.agentA).usePermission(parent, 1n, f.scope, req));
  assert.equal(await f.aegis.balances(f.addresses[0]), units(5000));
});

test('delegation depth bounds ancestor checks and all intermediate budgets are charged', async t => {
  const f = await setup(t), parent = await f.grant();
  const ids = [parent];
  for (let depth = 1; depth <= 4; depth++) {
    const id = await f.aegis.nextPermissionId();
    await (await f.aegis.connect(f.agentA).delegatePermission(ids.at(-1), 0n, 15n,
      units(500 - depth * 10), f.expiry - depth, true)).wait();
    ids.push(id);
  }
  await denied(f.aegis.connect(f.agentA).delegatePermission(ids.at(-1), 1n, 1n, 0n, f.expiry - 5, false));
  await (await f.aegis.connect(f.agentA).pay(ids.at(-1), f.addresses[3], units(10), requestId())).wait();
  for (const id of ids) assert.equal((await f.aegis.getPermission(id)).spent, units(10));
  await (await f.aegis.revokePermission(ids[2])).wait();
  assert.equal(await f.aegis.permissionStatus(ids[4]), Status.Revoked);
  assert.equal(await f.aegis.permissionStatus(parent), Status.Allowed);
});
