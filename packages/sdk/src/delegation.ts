import type { ActionRule, AgentPermission } from "./types.js";

export interface DelegatedPermissionInput {
  permissionId: string;
  agentId: string;
  dataScopes: AgentPermission["dataScopes"];
  actionRules: AgentPermission["actionRules"];
  expiresAt: number;
}

/** Build a child permission that cannot grant more than its parent. */
export function createDelegatedPermission(
  parent: AgentPermission,
  child: DelegatedPermissionInput,
  now = Math.floor(Date.now() / 1000),
): AgentPermission {
  if (parent.revokedAt !== undefined || parent.expiresAt <= now) {
    throw new Error("Cannot delegate from an inactive parent permission");
  }
  if (!child.permissionId || !child.agentId || child.agentId === parent.agentId) {
    throw new Error("Delegation requires a distinct child agent and permission ID");
  }
  if (child.expiresAt <= now || child.expiresAt > parent.expiresAt) {
    throw new Error("Delegated permission must expire before its parent");
  }
  if (!child.dataScopes.every((scope) => parent.dataScopes.includes(scope))) {
    throw new Error("Delegated permission includes a data scope not granted by its parent");
  }

  const parentRules = new Map(parent.actionRules.map((rule) => [rule.action, rule]));
  const seenActions = new Set<string>();
  for (const childRule of child.actionRules) {
    const parentRule = parentRules.get(childRule.action);
    if (!parentRule || seenActions.has(childRule.action) || !isRuleNarrower(childRule, parentRule)) {
      throw new Error(`Delegated action rule exceeds the parent: ${childRule.action}`);
    }
    seenActions.add(childRule.action);
  }

  return {
    permissionId: child.permissionId,
    user: parent.user,
    agentId: child.agentId,
    parentPermissionId: parent.permissionId,
    parentAgentId: parent.agentId,
    dataScopes: [...child.dataScopes],
    actionRules: child.actionRules.map((rule) => ({ ...rule })),
    expiresAt: child.expiresAt,
  };
}

/** Re-check attenuation on every request, not just when the child is created. */
export function isPermissionNarrower(
  child: AgentPermission,
  parent: AgentPermission,
): boolean {
  if (
    child.user.toLowerCase() !== parent.user.toLowerCase() ||
    child.parentPermissionId !== parent.permissionId ||
    child.parentAgentId !== parent.agentId ||
    child.expiresAt > parent.expiresAt ||
    !child.dataScopes.every((scope) => parent.dataScopes.includes(scope))
  ) {
    return false;
  }

  const parentRules = new Map(parent.actionRules.map((rule) => [rule.action, rule]));
  const seenActions = new Set<string>();
  return child.actionRules.every((childRule) => {
    const parentRule = parentRules.get(childRule.action);
    if (!parentRule || seenActions.has(childRule.action)) return false;
    seenActions.add(childRule.action);
    return isRuleNarrower(childRule, parentRule);
  });
}

function isRuleNarrower(child: ActionRule, parent: ActionRule): boolean {
  if (parent.maxAmountMinor !== undefined) {
    if (child.maxAmountMinor === undefined || child.maxAmountMinor > parent.maxAmountMinor) {
      return false;
    }
  }

  if (parent.currency !== undefined && child.currency !== parent.currency) return false;

  if (parent.allowedServices !== undefined) {
    if (
      child.allowedServices === undefined ||
      !child.allowedServices.every((service) => parent.allowedServices?.includes(service))
    ) {
      return false;
    }
  }

  if (parent.requireApprovalAboveMinor !== undefined) {
    if (
      child.requireApprovalAboveMinor === undefined ||
      child.requireApprovalAboveMinor > parent.requireApprovalAboveMinor
    ) {
      return false;
    }
  }

  return true;
}
