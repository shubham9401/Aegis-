require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { POST } = require('../src/app/api/agent/plan/route.ts');

test('Kimi boundary authenticates, fails without credentials, excludes vault values, and rejects invalid/truncated proposals', async () => {
  const previous = { ...process.env }, previousFetch = global.fetch;
  Object.assign(process.env, { AEGIS_AGENT_ID: 'agent', AEGIS_DEMO_AGENT_TOKEN: 'a'.repeat(40), AEGIS_APP_ORIGIN: 'http://localhost:3000' });
  const request = (body = { userRequest: 'Payment: USD 120.00 to 0x1111111111111111111111111111111111111111' }, token = 'a'.repeat(40)) => new Request('http://localhost:3000/api/agent/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  let calls = 0;
  try {
    delete process.env.KIMI_API_KEY;
    global.fetch = async () => { calls++; throw new Error('must not reach provider'); };
    assert.equal((await POST(request(undefined, 'wrong'))).status, 401);
    assert.equal((await POST(request())).status, 503); assert.equal(calls, 0);
    process.env.KIMI_API_KEY = 'server-only-key'; process.env.KIMI_MODEL = 'kimi-k2.6';
    assert.equal((await POST(request({ userRequest: 'request', context: { private: 'value' } }))).status, 400);
    const valid = { summary: 'Proposed test transfer', requestedDataScopes: ['profile:travel-budget'], proposedAction: { action: 'travel:book', amountMinor: '12000', currency: 'USD', service: '0x1111111111111111111111111111111111111111' } };
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.moonshot.ai/v1/chat/completions');
      const body = JSON.parse(options.body);
      assert.equal(body.thinking.type, 'disabled');
      assert.deepEqual(body.messages.filter(message => message.role === 'user'), [{ role: 'user', content: (await request().json()).userRequest }]);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(valid) } }] });
    };
    const response = await POST(request()); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { plan: valid, planner: 'kimi' });
    for (const invalid of [{ ...valid, requestedDataScopes: ['profile:travel-budget', 'profile:travel-budget'] },
      { ...valid, proposedAction: { ...valid.proposedAction, amountMinor: '0' } },
      { ...valid, proposedAction: { ...valid.proposedAction, currency: 'XYZ' } }]) {
      global.fetch = async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(invalid) } }] });
      assert.equal((await POST(request())).status, 502);
    }
    global.fetch = async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(valid) } }] });
    assert.equal((await POST(request())).status, 502);
    global.fetch = async () => Response.json({ error: 'server-only-key private provider response' }, { status: 429 });
    const failed = await POST(request()); assert.equal(failed.status, 502);
    assert.equal((await failed.text()).includes('server-only-key'), false);
  } finally {
    global.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
