require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, sep } = require('node:path');
const { privateKeyToAccount } = require('viem/accounts');
const { createChallenge, verifyChallenge } = require('../src/lib/server-auth.ts');
const permissions = require('../src/app/api/permissions/route.ts');
const vault = require('../src/app/api/vault/route.ts');
const context = require('../src/app/api/context/[scope]/route.ts');
const approvals = require('../src/app/api/approvals/route.ts');
const decision = require('../src/app/api/approvals/[id]/decision/route.ts');
const poll = require('../src/app/api/approvals/[id]/route.ts');
const activity = require('../src/app/api/activity/route.ts');
const { AEGIS_EIP712_DOMAIN, ACTION_APPROVAL_TYPES } = require('../src/lib/eip712.ts');

test('authenticated API flow: grant, gated vault, valid consent, over-limit deny and revoke', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-api-test-'));
  process.env.AEGIS_DATA_DIR = directory;
  process.env.AEGIS_APP_ORIGIN = 'http://localhost:3000';
  process.env.AEGIS_DEMO_AGENT_TOKEN = randomBytes(32).toString('hex');
  process.env.AEGIS_AGENT_ID = 'integration-agent';
  process.env.VAULT_SERVER_KEY = randomBytes(32).toString('base64');
  process.env.NEXT_PUBLIC_ADAPTER = 'demo';
  const account = privateKeyToAccount(`0x${randomBytes(32).toString('hex')}`);
  const agentHeaders = { authorization: `Bearer ${process.env.AEGIS_DEMO_AGENT_TOKEN}` };
  const request = (path, method = 'GET', body, headers = {}) => new Request(`http://localhost:3000${path}`, {
    method, headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    assert.equal((await permissions.POST(request('/api/permissions', 'POST', {}, { 'x-aegis-user': account.address }))).status, 401);
    const challenge = await createChallenge(request('/api/auth/challenge', 'POST', { address: account.address }));
    assert.equal(challenge.status, 200);
    const challengeCookie = challenge.headers.get('set-cookie').split(';')[0];
    const { message } = await challenge.json();
    const session = await verifyChallenge(request('/api/auth/session', 'POST', {
      address: account.address, signature: await account.signMessage({ message }),
    }, { cookie: challengeCookie }));
    assert.equal(session.status, 200);
    const cookie = session.headers.get('set-cookie').match(/aegis_owner=[^;,]+/)[0];
    const ownerHeaders = { cookie };
    const grantResponse = await permissions.POST(request('/api/permissions', 'POST', {
      agentId: process.env.AEGIS_AGENT_ID, dataScopes: ['profile:dietary-preference'],
      actionRules: [{ action: 'travel:book', maxAmountMinor: '50000', currency: 'USD',
        requireApprovalAboveMinor: '30000', allowedServices: ['specified-airline'] }], expiresInSeconds: 3600,
    }, ownerHeaders));
    assert.equal(grantResponse.status, 201);
    const grant = await grantResponse.json();
    assert.equal((await vault.PUT(request('/api/vault', 'PUT', {
      entries: [{ scope: 'profile:dietary-preference', value: 'private test fact' }],
    }, ownerHeaders))).status, 200);
    const query = `?user=${account.address}&agentId=${process.env.AEGIS_AGENT_ID}`;
    const allowed = await context.GET(request(`/api/context/profile:dietary-preference${query}`, 'GET', undefined, agentHeaders),
      { params: Promise.resolve({ scope: 'profile:dietary-preference' }) });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).value, 'private test fact');
    const denied = await context.GET(request(`/api/context/profile:passport-validity${query}`, 'GET', undefined, agentHeaders),
      { params: Promise.resolve({ scope: 'profile:passport-validity' }) });
    assert.equal((await denied.json()).error, 'DATA_SCOPE_NOT_GRANTED');
    const action = { permissionId: grant.permissionId, requestId: randomUUID(), user: account.address,
      agentId: process.env.AEGIS_AGENT_ID, action: 'travel:book', amountMinor: '40000', currency: 'USD',
      service: 'specified-airline', deadline: Math.floor(Date.now() / 1000) + 300 };
    const created = await approvals.POST(request('/api/approvals', 'POST', action, agentHeaders));
    assert.equal(created.status, 201);
    const pending = await created.json();
    const path = `/api/approvals/${pending.request.approvalId}`;
    const params = { params: Promise.resolve({ id: pending.request.approvalId }) };
    assert.equal((await poll.GET(request(path), params)).status, 401);
    const nonce = `0x${randomBytes(32).toString('hex')}`;
    const signature = await account.signTypedData({ domain: AEGIS_EIP712_DOMAIN, types: ACTION_APPROVAL_TYPES,
      primaryType: 'ActionApproval', message: { permissionId: action.permissionId, requestId: action.requestId,
        action: action.action, amountMinor: BigInt(action.amountMinor), currency: action.currency,
        service: action.service, nonce, deadline: BigInt(action.deadline) } });
    const proof = { outcome: 'approved', signer: account.address, signature, nonce };
    assert.equal((await decision.POST(request(`${path}/decision`, 'POST', { ...proof, signature: `0x${'ab'.repeat(65)}` }, ownerHeaders), params)).status, 403);
    assert.equal((await decision.POST(request(`${path}/decision`, 'POST', proof, ownerHeaders), params)).status, 200);
    assert.equal((await decision.POST(request(`${path}/decision`, 'POST', proof, ownerHeaders), params)).status, 409);
    assert.equal((await (await poll.GET(request(path, 'GET', undefined, agentHeaders), params)).json()).result.outcome, 'approved');
    const overLimit = await approvals.POST(request('/api/approvals', 'POST', { ...action, requestId: randomUUID(), amountMinor: '60000' }, agentHeaders));
    assert.equal((await overLimit.json()).error, 'AMOUNT_EXCEEDS_LIMIT');
    assert.equal((await permissions.DELETE(request(`/api/permissions${query}`, 'DELETE', undefined, ownerHeaders))).status, 200);
    const revokedRead = await context.GET(request(`/api/context/profile:dietary-preference${query}`, 'GET', undefined, agentHeaders),
      { params: Promise.resolve({ scope: 'profile:dietary-preference' }) });
    assert.equal((await revokedRead.json()).error, 'PERMISSION_REVOKED');
    assert.equal((await (await poll.GET(request(path, 'GET', undefined, agentHeaders), params)).json()).error, 'PERMISSION_REVOKED');
    const events = await (await activity.GET(request(`/api/activity?user=${account.address}`, 'GET', undefined, ownerHeaders))).json();
    assert.ok(events.activity.some((entry) => entry.type === 'permission_revoked'));
    assert.ok(events.activity.some((entry) => entry.reason === 'AMOUNT_EXCEEDS_LIMIT'));
    assert.ok(events.activity.some((entry) => entry.reason === 'PERMISSION_REVOKED'));
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
