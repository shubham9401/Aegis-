require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { privateKeyToAccount } = require('viem/accounts');
const { encrypt, decrypt, vaultWrite, vaultDecrypt } = require('../src/lib/vault.ts');
const { createApproval, decideApproval, getApproval, verifyApprovalSignature } = require('../src/lib/approval-store.ts');
const { amountMinorSchema, activityQuerySchema, grantPermissionSchema } = require('../src/lib/validation.ts');
const { AEGIS_EIP712_DOMAIN, ACTION_APPROVAL_TYPES } = require('../src/lib/eip712.ts');

process.env.VAULT_SERVER_KEY = randomBytes(32).toString('base64');
const account = privateKeyToAccount(`0x${'12'.repeat(32)}`);
const now = Math.floor(Date.now() / 1000);
const request = { approvalId: 'test', permissionId: 'permission', requestId: 'request', user: account.address,
  agentId: 'agent', action: 'travel:book', amountMinor: '40000', currency: 'USD', service: 'airline', requestedAt: now, deadline: now + 60 };

test('AES-GCM preserves multibyte text and rejects tampering/binding swaps', () => {
  const text = 'शाकाहारी 🥗';
  const ciphertext = encrypt(text, 'user:scope');
  assert.equal(decrypt(ciphertext, 'user:scope'), text);
  assert.throws(() => decrypt(ciphertext, 'different:scope'));
  const changed = Buffer.from(ciphertext, 'base64'); changed[changed.length - 1] ^= 1;
  assert.throws(() => decrypt(changed.toString('base64'), 'user:scope'));
});

test('vault persists ciphertext and reloads it from disk', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-vault-test-'));
  process.env.AEGIS_DATA_DIR = directory;
  try {
    vaultWrite(account.address, 'profile:dietary-preference', 'private 🥗');
    assert.equal(readFileSync(join(directory, 'vault.json'), 'utf8').includes('private'), false);
    assert.equal(vaultDecrypt(account.address.toLowerCase(), 'profile:dietary-preference'), 'private 🥗');
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + require('node:path').sep));
    rmSync(directory, { recursive: true, force: true }); delete process.env.AEGIS_DATA_DIR;
  }
});

test('approval proof rejects altered action fields and forged signatures', async () => {
  const nonce = `0x${'23'.repeat(32)}`;
  const signature = await account.signTypedData({ domain: AEGIS_EIP712_DOMAIN, types: ACTION_APPROVAL_TYPES, primaryType: 'ActionApproval',
    message: { permissionId: request.permissionId, requestId: request.requestId, action: request.action, amountMinor: BigInt(request.amountMinor),
      currency: request.currency, service: request.service, nonce, deadline: BigInt(request.deadline) } });
  assert.equal(await verifyApprovalSignature(request, signature, nonce), true);
  assert.equal(await verifyApprovalSignature({ ...request, amountMinor: '40001' }, signature, nonce), false);
  assert.equal(await verifyApprovalSignature(request, `0x${'00'.repeat(65)}`, nonce), false);
});

test('approval retries deduplicate, changed request IDs conflict, and decisions are single assignment', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-approval-test-'));
  process.env.AEGIS_DATA_DIR = directory;
  try {
  createApproval(request);
  assert.equal(createApproval({ ...request, approvalId: 'retry' }).request.approvalId, 'test');
  assert.throws(() => createApproval({ ...request, amountMinor: '40001' }), /REQUEST_ID_CONFLICT/);
  assert.ok(decideApproval('test', { approvalId: 'test', outcome: 'rejected', signedAt: now }));
  assert.equal(getApproval('test').result.outcome, 'rejected');
  const ciphertext = JSON.parse(readFileSync(join(directory, 'approvals.json'), 'utf8'));
  assert.equal(readFileSync(join(directory, 'approvals.json'), 'utf8').includes('rejected'), false);
  assert.equal(JSON.parse(decrypt(ciphertext, 'aegis/approval-queue/v1'))[0][1].result.outcome, 'rejected');
  assert.equal(decideApproval('test', { approvalId: 'test', outcome: 'rejected', signedAt: now }), null);
  createApproval({ ...request, approvalId: 'expired', requestId: 'expired', deadline: now - 1 });
  assert.equal(decideApproval('expired', { approvalId: 'expired', outcome: 'rejected', signedAt: now }), null);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + require('node:path').sep));
    rmSync(directory, { recursive: true, force: true }); delete process.env.AEGIS_DATA_DIR;
  }
});

test('integer amount schema rejects uint256 overflow; omitted activity limit uses 50', () => {
  assert.equal(amountMinorSchema.safeParse((2n ** 256n).toString()).success, false);
  assert.equal(amountMinorSchema.safeParse('1.50').success, false);
  assert.equal(activityQuerySchema.parse({ user: account.address }).limit, 50);
});

test('permission grants reject empty rights, ambiguous duplicate rules and impossible thresholds', () => {
  const grant = { agentId: 'agent', dataScopes: [], actionRules: [], expiresInSeconds: 60 };
  assert.equal(grantPermissionSchema.safeParse(grant).success, false);
  const rule = { action: 'travel:book', maxAmountMinor: '100', requireApprovalAboveMinor: '50' };
  assert.equal(grantPermissionSchema.safeParse({ ...grant, actionRules: [rule, rule] }).success, false);
  assert.equal(grantPermissionSchema.safeParse({ ...grant, actionRules: [{ ...rule, requireApprovalAboveMinor: '101' }] }).success, false);
  assert.equal(grantPermissionSchema.safeParse({ ...grant, actionRules: [rule] }).success, true);
});
