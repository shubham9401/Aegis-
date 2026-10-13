import { indexer } from "envio";

indexer.onEvent(
  { contract: "AegisPermissions", event: "PermissionGranted" },
  async ({ event, context }) => {
    const permissionId = event.params.permissionId.toString();
    context.Permission.set({
      id: permissionId,
      user: event.params.user,
      parentId: event.params.parentId,
      agentId: event.params.agentId,
      agent: event.params.agent,
      scope: event.params.scope,
      actions: event.params.actions,
      spendingLimit: event.params.spendingLimit,
      expiresAt: event.params.expiresAt,
      canDelegate: event.params.canDelegate,
      paymentRecipient: event.params.paymentRecipient,
      revoked: false,
      lastBlock: event.block.number,
    });
    context.AegisActivity.set({
      id: `grant-${permissionId}`,
      kind: "permission_granted",
      permissionId: event.params.permissionId,
      user: event.params.user,
      agent: event.params.agent,
      recipient: event.params.paymentRecipient,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
    });
  },
);

indexer.onEvent(
  { contract: "AegisPermissions", event: "PermissionRevoked" },
  async ({ event, context }) => {
    const id = event.params.permissionId.toString();
    const permission = await context.Permission.get(id);
    if (permission) {
      context.Permission.set({ ...permission, revoked: true, revokedBy: event.params.revokedBy, lastBlock: event.block.number });
    }
    context.AegisActivity.set({
      id: `revoke-${id}`,
      kind: "permission_revoked",
      permissionId: event.params.permissionId,
      actor: event.params.revokedBy,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
    });
  },
);

indexer.onEvent(
  { contract: "AegisPermissions", event: "PaymentApproved" },
  async ({ event, context }) => {
    context.AegisActivity.set({
      id: `approval-${event.block.number}-${event.params.permissionId}-${event.params.requestId}`,
      kind: "payment_approved",
      permissionId: event.params.permissionId,
      requestId: event.params.requestId,
      user: event.params.user,
      recipient: event.params.recipient,
      amount: event.params.amount,
      deadline: event.params.deadline,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
    });
  },
);

indexer.onEvent(
  { contract: "AegisPermissions", event: "PermissionUsed" },
  async ({ event, context }) => {
    context.AegisActivity.set({
      id: `use-${event.params.rootId}-${event.params.requestId}`,
      kind: "permission_used",
      permissionId: event.params.permissionId,
      rootId: event.params.rootId,
      requestId: event.params.requestId,
      agent: event.params.agent,
      recipient: event.params.recipient,
      action: event.params.action,
      amount: event.params.amount,
      manuallyApproved: event.params.manuallyApproved,
      blockNumber: event.block.number,
      timestamp: event.block.timestamp,
    });
  },
);
