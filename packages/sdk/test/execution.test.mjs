import test from 'node:test';
import assert from 'node:assert/strict';
import { AegisClient, MemoryPermissionStore, parseTestAmount, centsToTestUnits } from '../dist/index.js';
test('token conversion rejects rounding, exponent notation and overflow', () => {
  assert.equal(parseTestAmount('500.000001'), 500000001n);
  assert.equal(centsToTestUnits('50000'), 500000000n);
  for (const value of ['-1', '1e6', '1.0000001', 'Infinity', '']) assert.throws(() => parseTestAmount(value));
  assert.throws(() => centsToTestUnits(String(2n ** 256n)));
});
test('revocation during consent blocks execution and later retries', async () => {
  const user = '0x1111111111111111111111111111111111111111';
  const grant = { permissionId: 'p', user, agentId: 'a', dataScopes: [], actionRules: [{ action: 'travel:book', requireApprovalAboveMinor: 1n }], expiresAt: 1000 };
  let revoked = false;
  const client = new AegisClient({ store: { async getPermission() { return revoked ? { ...grant, revokedAt: 101 } : grant; } }, now: () => 100 });
  const request = { user, agentId: 'a', requestId: 'one', kind: 'action', requestedAt: 100, action: 'travel:book', amountMinor: 2n };
  let executed = 0;
  const result = await client.executeAction(request, async () => ++executed, async () => { revoked = true; return true; });
  assert.equal(result.executed, false); assert.equal(executed, 0);
  assert.equal((await client.executeAction(request, async () => ++executed)).decision.reason, 'PERMISSION_REVOKED');
});

test('concurrent and repeated execution consume a request only once', async () => {
  const user = '0x1111111111111111111111111111111111111111';
  const grant = { permissionId: 'p', user, agentId: 'a', dataScopes: [], actionRules: [{ action: 'travel:book' }], expiresAt: 1000 };
  const client = new AegisClient({ store: new MemoryPermissionStore([grant]), now: () => 100 });
  const request = { user, agentId: 'a', requestId: 'race', kind: 'action', requestedAt: 100, action: 'travel:book' };
  let executions = 0;
  const execute = async () => ++executions;
  const results = await Promise.all([client.executeAction(request, execute), client.executeAction(request, execute)]);
  assert.equal(results.filter((r) => r.executed).length, 1);
  assert.equal((await client.executeAction(request, execute)).decision.reason, 'REQUEST_ALREADY_USED');
  assert.equal(executions, 1);
});
