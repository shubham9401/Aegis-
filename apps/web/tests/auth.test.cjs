require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const { createChallenge, verifyChallenge, requireUser, requireAgent, endSession } = require('../src/lib/server-auth.ts');
const origin = 'http://localhost:3000';
function req(path, body, cookie = '', extra = {}) {
  return new Request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { origin, 'content-type': 'application/json', cookie, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookieFrom = (response, name) => response.headers.get('set-cookie').match(new RegExp(`${name}=([^;]+)`))[0];
test('owner session requires signed nonce, blocks replay and wrong owner, ends on logout', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const challenge = await createChallenge(req('/api/auth/challenge', { address: account.address }));
  assert.equal(challenge.status, 200);
  const challengeCookie = cookieFrom(challenge, 'aegis_challenge');
  const { message } = await challenge.json();
  const signature = await account.signMessage({ message });
  const proof = { address: account.address, signature };
  const verified = await verifyChallenge(req('/api/auth/verify', proof, challengeCookie));
  assert.equal(verified.status, 200);
  const sessionCookie = cookieFrom(verified, 'aegis_owner');
  assert.match(verified.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(verified.headers.get('set-cookie'), /SameSite=strict/i);
  assert.equal(await requireUser(req('/api/vault', undefined, sessionCookie), account.address), account.address);
  assert.equal((await requireUser(req('/api/vault', undefined, sessionCookie), '0x1111111111111111111111111111111111111111')).status, 403);
  assert.equal((await verifyChallenge(req('/api/auth/verify', proof, challengeCookie))).status, 401);
  assert.equal((await requireUser(req('/api/vault', {}, sessionCookie, { origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await endSession(req('/api/auth/session', {}, sessionCookie))).status, 200);
  assert.equal((await requireUser(req('/api/vault', undefined, sessionCookie))).status, 401);
});
test('forged identity headers, bad proofs, oversized and cross-origin challenges fail closed', async () => {
  assert.equal((await requireUser(req('/api/vault', undefined, '', { 'X-Aegis-User': '0x1111111111111111111111111111111111111111' }))).status, 401);
  assert.equal((await createChallenge(req('/api/auth/challenge', { address: '0x1111111111111111111111111111111111111111' }, '', { origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await createChallenge(req('/api/auth/challenge', { address: 'a'.repeat(20000) }))).status, 400);
  const account = privateKeyToAccount(generatePrivateKey()), wrong = privateKeyToAccount(generatePrivateKey());
  const challenge = await createChallenge(req('/api/auth/challenge', { address: account.address }));
  const cookie = cookieFrom(challenge, 'aegis_challenge'), { message } = await challenge.json();
  assert.equal((await verifyChallenge(req('/api/auth/verify', { address: account.address, signature: await wrong.signMessage({ message }) }, cookie))).status, 401);
});
test('agent auth requires secret and an explicitly configured identity', async () => {
  const previousToken = process.env.AEGIS_DEMO_AGENT_TOKEN, previousId = process.env.AEGIS_AGENT_ID;
  try {
    process.env.AEGIS_DEMO_AGENT_TOKEN = 'a'.repeat(40); delete process.env.AEGIS_AGENT_ID;
    const request = () => req('/api/context', undefined, '', { authorization: 'Bearer ' + 'a'.repeat(40) });
    assert.equal((await requireAgent(request())).status, 503);
    process.env.AEGIS_AGENT_ID = 'agreed-agent';
    assert.equal(await requireAgent(request()), 'agreed-agent');
    assert.equal((await requireAgent(req('/api/context'))).status, 401);
  } finally {
    if (previousToken === undefined) delete process.env.AEGIS_DEMO_AGENT_TOKEN; else process.env.AEGIS_DEMO_AGENT_TOKEN = previousToken;
    if (previousId === undefined) delete process.env.AEGIS_AGENT_ID; else process.env.AEGIS_AGENT_ID = previousId;
  }
});
