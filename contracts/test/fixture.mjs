import ganache from 'ganache';
import { BrowserProvider, ContractFactory, hexlify, randomBytes, parseUnits, ZeroAddress } from 'ethers';

export const units = value => parseUnits(String(value), 6);
export const requestId = () => hexlify(randomBytes(32));
export const Status = Object.freeze({ Allowed: 0n, NotFound: 1n, Revoked: 2n, Expired: 3n,
  IdentityChanged: 4n, WrongAgent: 5n, InvalidAction: 6n, ActionNotAllowed: 7n,
  WrongScope: 8n, WrongRecipient: 9n, BudgetExceeded: 10n, InsufficientBalance: 11n, InvalidAmount: 12n });

export async function fixture(artifacts) {
  const engine = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 31337, hardfork: 'shanghai' },
    wallet: { totalAccounts: 10 },
    miner: { instamine: 'eager' },
  });
  const provider = new BrowserProvider(engine, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 20;
  const signers = await Promise.all(Array.from({ length: 8 }, (_, i) => provider.getSigner(i)));
  const [user, agentA, agentB, merchant, stranger, agentC] = signers;
  const addresses = await Promise.all(signers.map(s => s.getAddress()));
  async function deploy(name, args = []) {
    const a = artifacts[name];
    const c = await new ContractFactory(a.abi, a.bytecode, user).deploy(...args);
    await c.waitForDeployment();
    return c;
  }
  const registry = await deploy('MockIdentityRegistry');
  const token = await deploy('MockUSD');
  const aegis = await deploy('AegisPermissions', [await registry.getAddress(), await token.getAddress()]);
  for (const agent of [agentA, agentB, agentC]) await (await registry.connect(agent).register()).wait();
  const scope = requestId();
  const now = Number((await provider.getBlock('latest')).timestamp);
  const expiry = now + 3600;
  await (await token.mint(addresses[0], units(5000))).wait();
  await (await token.approve(await aegis.getAddress(), units(5000))).wait();
  await (await aegis.deposit(units(5000))).wait();
  async function grant(overrides = {}) {
    const params = { agentId: 0n, scope, actions: 15n, spendingLimit: units(500),
      expiresAt: expiry, canDelegate: true, paymentRecipient: addresses[3], ...overrides };
    const id = await aegis.nextPermissionId();
    await (await aegis.grantPermission(params)).wait();
    return id;
  }
  async function child(parentId, overrides = {}) {
    const p = { agentId: 1n, actions: 11n, spendingLimit: units(100),
      expiresAt: expiry - 60, canDelegate: false, ...overrides };
    const id = await aegis.nextPermissionId();
    await (await aegis.connect(agentA).delegatePermission(parentId, p.agentId, p.actions,
      p.spendingLimit, p.expiresAt, p.canDelegate)).wait();
    return id;
  }
  return { engine, provider, signers, user, agentA, agentB, agentC, merchant, stranger,
    addresses, registry, token, aegis, scope, now, expiry, grant, child, deploy,
    close: async () => { provider.destroy(); await engine.disconnect(); } };
}

export { ZeroAddress };
