require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const ganache = require('ganache');
const { Wallet, ContractFactory, JsonRpcProvider, hexlify, randomBytes } = require('ethers');
const { PAYMENT_REQUEST_TYPES } = require('@aegis/sdk');
const { authenticatePayment, enqueuePayment, paymentState } = require('../src/lib/chain-requests.ts');
const { vaultWrite } = require('../src/lib/vault.ts');
const contextRoute = require('../src/app/api/context/[scope]/route.ts');
const paymentRoute = require('../src/app/api/chain/payments/route.ts');
const stateRoute = require('../src/app/api/chain/route.ts');
test('real contracts + gateway: delegated data, signed extra payment, replay and parent revocation', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-chain-flow-'));
  const server = ganache.server({ logging: { quiet: true }, chain: { chainId: 10143, hardfork: 'shanghai' } });
  let provider;
  const previous = { ...process.env };
  try {
    await server.listen(0, '127.0.0.1');
    const rpc = `http://127.0.0.1:${server.address().port}`;
    provider = new JsonRpcProvider(rpc, 10143, { batchMaxCount: 1, cacheTimeout: -1 }); provider.pollingInterval = 20;
    const keys = Object.values(server.provider.getInitialAccounts());
    const owner = await provider.getSigner(0), agent = await provider.getSigner(1), child = await provider.getSigner(2);
    const agentWallet = new Wallet(keys[1].secretKey), childWallet = new Wallet(keys[2].secretKey);
    const ownerAddress = await owner.getAddress(), merchant = await (await provider.getSigner(3)).getAddress();
    const deploy = async (name, args = []) => {
      const artifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../contracts/artifacts', name + '.json'), 'utf8'));
      const contract = await new ContractFactory(artifact.abi, artifact.bytecode, owner).deploy(...args); await contract.waitForDeployment(); return contract;
    };
    const registry = await deploy('MockIdentityRegistry'), token = await deploy('MockUSD');
    const aegis = await deploy('AegisPermissions', [await registry.getAddress(), await token.getAddress()]);
    await (await registry.connect(agent).register()).wait(); await (await registry.connect(child).register()).wait();
    const scope = hexlify(randomBytes(32)); const expiry = Math.floor(Date.now() / 1000) + 3600;
    Object.assign(process.env, { NEXT_PUBLIC_ADAPTER: 'contract', AEGIS_DATA_DIR: directory, VAULT_SERVER_KEY: crypto.randomBytes(32).toString('base64'),
      AEGIS_RESOURCE_SCOPE: scope, AEGIS_CONTRACT_ADDRESS: await aegis.getAddress(), AEGIS_PAYMENT_TOKEN_ADDRESS: await token.getAddress(),
      AEGIS_IDENTITY_REGISTRY_ADDRESS: await registry.getAddress(), MONAD_RPC_URL: rpc, AEGIS_APP_ORIGIN: 'http://localhost:3000' });
    await (await token.mint(ownerAddress, 2000_000000n)).wait(); await (await token.approve(await aegis.getAddress(), 2000_000000n)).wait(); await (await aegis.deposit(2000_000000n)).wait();
    await (await aegis.grantPermission({ agentId: 0, scope, actions: 57, spendingLimit: 500_000000n, expiresAt: expiry, canDelegate: true, paymentRecipient: merchant })).wait();
    await (await aegis.connect(agent).delegatePermission(1, 1, 1, 0, expiry - 60, false)).wait();
    vaultWrite(ownerAddress, 'profile:dietary-preference', 'private sample', scope.toLowerCase());
    const dataRequest = async (action = 1n, field = 'profile:dietary-preference') => {
      const requestId = hexlify(randomBytes(32)), deadline = Math.floor(Date.now() / 1000) + 60;
      const signature = await childWallet.signTypedData({ name: 'AegisDataGateway', version: '1', chainId: 10143, verifyingContract: await aegis.getAddress() },
        { DataRequest: [{name:'permissionId',type:'uint256'},{name:'scope',type:'bytes32'},{name:'action',type:'uint256'},{name:'requestId',type:'bytes32'},{name:'deadline',type:'uint64'},{name:'audience',type:'string'}] },
        { permissionId: 2, scope, action, requestId, deadline, audience: 'http://localhost:3000' });
      return contextRoute.GET(new Request(`http://localhost:3000/api/context/${field}?user=${ownerAddress}&agentId=1&permissionId=2`, { headers: { 'x-aegis-request-id': requestId, 'x-aegis-deadline': String(deadline), 'x-aegis-signature': signature } }), { params: Promise.resolve({ scope: field }) });
    };
    const released = await dataRequest(); assert.equal(released.status, 200); assert.equal((await released.json()).value, 'private sample');
    assert.equal((await dataRequest(32n, 'profile:passport-validity')).status, 403);
    const input = { permissionId: '1', requestId: hexlify(randomBytes(32)), recipient: merchant, amount: '650000000', deadline: Math.floor(Date.now() / 1000) + 300 };
    const signature = await agentWallet.signTypedData({ name: 'AegisPayments', version: '1', chainId: 10143, verifyingContract: await aegis.getAddress() }, { PaymentRequest: PAYMENT_REQUEST_TYPES.PaymentRequest.map((f) => ({ ...f })) }, { ...input, audience: 'http://localhost:3000' });
    const signed = { ...input, signature };
    const apiRequest = (body) => new Request('http://localhost:3000/api/chain/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await paymentRoute.GET(new Request('http://localhost:3000/api/chain/payments'))).status, 401);
    assert.equal((await stateRoute.GET(new Request('http://localhost:3000/api/chain'))).status, 401);
    assert.equal((await paymentRoute.POST(apiRequest({ ...signed, signature: 'invalid' }))).status, 400);
    assert.equal((await paymentRoute.POST(apiRequest({ ...signed, amount: '660000000' }))).status, 403);
    const queued = await paymentRoute.POST(apiRequest(signed));
    assert.equal(queued.status, 200); assert.equal((await queued.json()).outcome, 'pending');
    await authenticatePayment(signed, 'http://localhost:3000');
    await assert.rejects(authenticatePayment({ ...signed, amount: '660000000' }, 'http://localhost:3000'));
    await assert.rejects(authenticatePayment(signed, 'https://wrong.example'));
    assert.equal(await aegis.checkPayment(1, agentWallet.address, merchant, input.amount), 10n);
    const entry = enqueuePayment(signed, ownerAddress, 0n, 1n);
    assert.equal(enqueuePayment(signed, ownerAddress, 0n, 1n).createdAt, entry.createdAt);
    assert.throws(() => enqueuePayment({ ...signed, amount: '1' }, ownerAddress, 0n, 1n));
    assert.equal((await paymentState(entry)).outcome, 'pending');
    await (await aegis.approvePayment(1, input.requestId, merchant, input.amount, input.deadline)).wait();
    assert.equal((await paymentState(entry)).outcome, 'approved');
    await (await aegis.connect(agent).pay(1, merchant, input.amount, input.requestId)).wait();
    assert.equal(await token.balanceOf(merchant), 650000000n); assert.equal((await paymentState(entry)).outcome, 'consumed');
    await assert.rejects(aegis.connect(agent).pay.staticCall(1, merchant, input.amount, input.requestId));
    await (await aegis.revokePermission(1)).wait();
    assert.equal((await dataRequest()).status, 403);
    await assert.rejects(authenticatePayment(signed, 'http://localhost:3000'));
    // The queue persists encrypted, never as plaintext signature/request data.
    assert.ok(!fs.readFileSync(path.join(directory, 'chain-payments.json'), 'utf8').includes(signature));
  } finally {
    provider?.destroy(); await server.close();
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
