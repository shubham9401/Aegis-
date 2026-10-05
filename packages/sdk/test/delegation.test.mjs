import assert from "node:assert/strict";
import test from "node:test";
import {
  AegisClient,
  createDelegatedPermission,
  MemoryPermissionStore,
} from "../dist/index.js";

const user = "0x1111111111111111111111111111111111111111";
const now = 100;

function parentPermission() {
  return {
    permissionId: "parent-1",
    user,
    agentId: "agent-parent",
    dataScopes: ["profile:dietary-preference", "profile:travel-budget"],
    actionRules: [
      {
        action: "travel:book",
        maxAmountMinor: 50_000n,
        requireApprovalAboveMinor: 30_000n,
        currency: "USD",
        allowedServices: ["demo-airline", "demo-rail"],
      },
      { action: "travel:search", allowedServices: ["demo-airline", "demo-rail"] },
    ],
    expiresAt: 1_000,
  };
}

function childPermission(parent = parentPermission()) {
  return createDelegatedPermission(
    parent,
    {
      permissionId: "child-1",
      agentId: "agent-helper",
      dataScopes: ["profile:dietary-preference"],
      actionRules: [{ action: "travel:search", allowedServices: ["demo-airline"] }],
      expiresAt: 500,
    },
    now,
  );
}

function request(agentId, scope = "profile:dietary-preference") {
  return {
    requestId: crypto.randomUUID(),
    user,
    agentId,
    requestedAt: now,
    kind: "data",
    scope,
  };
}

test("delegation refuses scopes, actions, limits, or expiry broader than the parent", () => {
  const parent = parentPermission();

  assert.throws(
    () =>
      createDelegatedPermission(
        parent,
        {
          permissionId: "too-broad-scope",
          agentId: "agent-helper",
          dataScopes: ["profile:passport-validity"],
          actionRules: [],
          expiresAt: 500,
        },
        now,
      ),
    /data scope/,
  );

  assert.throws(
    () =>
      createDelegatedPermission(
        parent,
        {
          permissionId: "too-broad-amount",
          agentId: "agent-helper",
          dataScopes: [],
          actionRules: [{ action: "travel:book", maxAmountMinor: 60_000n, currency: "USD" }],
          expiresAt: 500,
        },
        now,
      ),
    /exceeds the parent/,
  );

  assert.throws(
    () =>
      createDelegatedPermission(
        parent,
        {
          permissionId: "too-long",
          agentId: "agent-helper",
          dataScopes: [],
          actionRules: [],
          expiresAt: 1_001,
        },
        now,
      ),
    /expire before its parent/,
  );
});

test("child access is limited and parent revocation blocks future child access", async () => {
  const parent = parentPermission();
  const child = childPermission(parent);
  const store = new MemoryPermissionStore([parent]);
  store.delegatePermission(parent.agentId, child);
  const aegis = new AegisClient({ store, now: () => now });

  assert.equal((await aegis.check(request(child.agentId))).outcome, "allow");
  assert.deepEqual(await aegis.check(request(child.agentId, "profile:travel-budget")), {
    outcome: "deny",
    reason: "DATA_SCOPE_NOT_GRANTED",
    permissionId: child.permissionId,
  });

  let released = false;
  const gatedRead = await aegis.readData(request(child.agentId), async () => {
    released = true;
    return "vegetarian";
  });
  assert.equal(gatedRead.decision.outcome, "allow");
  assert.equal(gatedRead.data, "vegetarian");
  assert.equal(released, true);

  store.revokePermission(user, parent.agentId, now);
  released = false;
  const deniedRead = await aegis.readData(request(child.agentId), async () => {
    released = true;
    return "should not be released";
  });

  assert.equal(deniedRead.decision.outcome, "deny");
  assert.equal(deniedRead.decision.reason, "PARENT_PERMISSION_REVOKED");
  assert.equal(deniedRead.data, undefined);
  assert.equal(released, false);
});

test("SDK revalidates child attenuation on every request", async () => {
  const parent = parentPermission();
  const child = childPermission(parent);
  const store = new MemoryPermissionStore([parent]);
  store.delegatePermission(parent.agentId, child);
  store.setPermission({ ...child, dataScopes: ["profile:passport-validity"] });

  const decision = await new AegisClient({ store, now: () => now }).check(
    request(child.agentId, "profile:passport-validity"),
  );
  assert.equal(decision.outcome, "deny");
  assert.equal(decision.reason, "DELEGATION_EXCEEDS_PARENT");
});

test("sensitive actions stay blocked until an approval adapter confirms", async () => {
  const parent = parentPermission();
  const store = new MemoryPermissionStore([parent]);
  const aegis = new AegisClient({ store, now: () => now });
  const booking = {
    requestId: crypto.randomUUID(),
    user,
    agentId: parent.agentId,
    requestedAt: now,
    kind: "action",
    action: "travel:book",
    amountMinor: 40_000n,
    currency: "USD",
    service: "demo-airline",
  };
  let executions = 0;
  const execute = async () => {
    executions += 1;
    return "booked";
  };

  const withoutApproval = await aegis.executeAction(booking, execute);
  assert.equal(withoutApproval.decision.outcome, "approval_required");
  assert.equal(withoutApproval.executed, false);
  assert.equal(executions, 0);

  const approved = await aegis.executeAction(booking, execute, async () => true);
  assert.equal(approved.executed, true);
  assert.equal(approved.result, "booked");
  assert.equal(executions, 1);
});
