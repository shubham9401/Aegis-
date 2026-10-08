import assert from "node:assert/strict";
import test from "node:test";
import { ContractPermissionGate } from "../dist/index.js";

const user = "0x1111111111111111111111111111111111111111";
const agent = "0x2222222222222222222222222222222222222222";
const scope = `0x${"33".repeat(32)}`;

function reader(overrides = {}) {
  return {
    async getPermission() {
      return { user, agent, agentId: 7n, scope, ...overrides.permission };
    },
    async checkPermission(permissionId, actor, action, checkedScope) {
      assert.equal(permissionId, 12n);
      assert.equal(actor, agent);
      assert.equal(action, 16n);
      assert.equal(checkedScope, scope);
      return overrides.status ?? 0n;
    },
  };
}

const request = {
  permissionId: 12n,
  user,
  agentId: 7n,
  actor: agent,
  dataScope: "profile:travel-budget",
  expectedResourceScope: scope,
};

test("contract gate maps a data scope and allows only a live matching grant", async () => {
  const decision = await new ContractPermissionGate(reader()).checkDataAccess(request);
  assert.equal(decision.outcome, "allow");
  assert.equal(decision.action, 16n);
  assert.equal(decision.resourceScope, scope);
});

test("contract gate rejects user, identity, actor, resource, and contract mismatches", async () => {
  const cases = [
    [reader({ permission: { user: "0x4444444444444444444444444444444444444444" } }), "USER_MISMATCH"],
    [reader({ permission: { agentId: 8n } }), "AGENT_ID_MISMATCH"],
    [reader({ permission: { agent: "0x5555555555555555555555555555555555555555" } }), "AGENT_ADDRESS_MISMATCH"],
    [reader({ permission: { scope: `0x${"66".repeat(32)}` } }), "RESOURCE_SCOPE_MISMATCH"],
    [reader({ status: 2n }), "CONTRACT_DENIED"],
  ];
  for (const [source, reason] of cases) {
    const decision = await new ContractPermissionGate(source).checkDataAccess(request);
    assert.equal(decision.outcome, "deny");
    assert.equal(decision.reason, reason);
  }
});
