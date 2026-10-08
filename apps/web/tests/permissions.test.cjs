require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, sep } = require('node:path');
const { DemoPermissionAdmin, getPermissionStore } = require('../src/lib/permission-admin.ts');
const { AegisClient } = require('@aegis/sdk');
const { decimalToMinorUnits, formatCurrency, parseBody } = require('../src/lib/utils.ts');
const { grantPermissionSchema } = require('../src/lib/validation.ts');

test('persisted permission grants and revocations survive fresh store initialization', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-permissions-test-'));
  const previous = process.env.AEGIS_DATA_DIR;
  process.env.AEGIS_DATA_DIR = directory;
  delete global.__aegis_store;
  delete global.__aegis_permissions;
  const user = `0x${'11'.repeat(20)}`;
  const permission = { permissionId: 'persisted-grant', user, agentId: 'configured-agent',
    dataScopes: ['profile:dietary-preference'],
    actionRules: [{ action: 'travel:book', maxAmountMinor: 50000n, currency: 'USD', requireApprovalAboveMinor: 30000n }],
    expiresAt: Math.floor(Date.now() / 1000) + 3600 };
  try {
    const admin = new DemoPermissionAdmin();
    await admin.grant(permission);
    assert.equal(JSON.parse(readFileSync(join(directory, 'permissions.json'), 'utf8'))[0].actionRules[0].maxAmountMinor, '50000');
    delete global.__aegis_store;
    delete global.__aegis_permissions;
    assert.deepEqual((await admin.list(user))[0], permission);
    const request = { kind: 'data', user, agentId: permission.agentId, scope: 'profile:dietary-preference', requestId: 'read', requestedAt: 1 };
    assert.equal((await new AegisClient({ store: getPermissionStore() }).check(request)).outcome, 'allow');
    await admin.revoke(user, permission.agentId);
    delete global.__aegis_store;
    delete global.__aegis_permissions;
    assert.equal((await new AegisClient({ store: getPermissionStore() }).check(request)).reason, 'PERMISSION_REVOKED');
    writeFileSync(join(directory, 'permissions.json'), '{corrupt');
    delete global.__aegis_store;
    delete global.__aegis_permissions;
    await assert.rejects(admin.list(user), /refusing to reset existing state/);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
    if (previous === undefined) delete process.env.AEGIS_DATA_DIR; else process.env.AEGIS_DATA_DIR = previous;
    delete global.__aegis_store;
    delete global.__aegis_permissions;
  }
});

test('decimal amounts retain precision and invalid decimals are rejected', () => {
  assert.equal(decimalToMinorUnits('0.29'), '29');
  assert.equal(decimalToMinorUnits('9007199254740993.29'), '900719925474099329');
  assert.equal(formatCurrency('900719925474099329'), '$9,007,199,254,740,993.29');
  assert.throws(() => decimalToMinorUnits('0.001'));
  assert.throws(() => decimalToMinorUnits('-1'));
});

test('body parser bounds payload size and does not echo private invalid inputs', async () => {
  const tooLarge = new Request('http://localhost', { method: 'POST', body: 'x'.repeat(17000) });
  assert.equal((await parseBody(tooLarge, grantPermissionSchema)).status, 413);
  const invalid = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ private: 'private-test-value' }) });
  const response = await parseBody(invalid, grantPermissionSchema);
  assert.equal(response.status, 400);
  assert.equal((await response.text()).includes('private-test-value'), false);
});
