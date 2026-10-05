import type {
  ActionRequest,
  ActionRule,
  AgentPermission,
  AgentRequest,
  DataAccessRequest,
  PermissionDecision,
  PermissionStore,
} from "./types.js";
import { isPermissionNarrower } from "./delegation.js";

export interface AegisClientOptions {
  store: PermissionStore;
  now?: () => number;
}

export class AegisClient {
  readonly #store: PermissionStore;
  readonly #now: () => number;

  constructor({ store, now = () => Math.floor(Date.now() / 1000) }: AegisClientOptions) {
    this.#store = store;
    this.#now = now;
  }

  async check(request: AgentRequest): Promise<PermissionDecision> {
    const permission = await this.#store.getPermission(request.user, request.agentId);

    if (!permission) return { outcome: "deny", reason: "PERMISSION_NOT_FOUND" };

    const inactive = this.#checkInactive(permission);
    if (inactive) return inactive;

    const inherited = await this.#checkParentChain(permission, request.user);
    if (inherited) return inherited;

    if (request.kind === "data") {
      if (!permission.dataScopes.includes(request.scope)) {
        return {
          outcome: "deny",
          reason: "DATA_SCOPE_NOT_GRANTED",
          permissionId: permission.permissionId,
        };
      }

      return {
        outcome: "allow",
        reason: "REQUEST_ALLOWED",
        permissionId: permission.permissionId,
      };
    }

    const rule = permission.actionRules.find(({ action }) => action === request.action);
    if (!rule) {
      return {
        outcome: "deny",
        reason: "ACTION_NOT_GRANTED",
        permissionId: permission.permissionId,
      };
    }

    return this.#checkAction(permission.permissionId, request, rule);
  }

  /**
   * Enforce the check at the data-release boundary. The callback should be a
   * user-controlled vault/key holder and must not release data on its own.
   */
  async readData<T>(
    request: DataAccessRequest,
    releaseScopedData: (scope: DataAccessRequest["scope"], permissionId: string) => Promise<T>,
  ): Promise<{ decision: PermissionDecision; data?: T }> {
    const decision = await this.check(request);
    if (decision.outcome !== "allow") return { decision };

    const data = await releaseScopedData(request.scope, decision.permissionId);
    return { decision, data };
  }

  /** Run an action only when allowed or after an approval adapter confirms it. */
  async executeAction<T>(
    request: ActionRequest,
    execute: () => Promise<T>,
    approveSensitive?: (decision: Extract<PermissionDecision, { outcome: "approval_required" }>) => Promise<boolean>,
  ): Promise<{ decision: PermissionDecision; executed: boolean; result?: T }> {
    const decision = await this.check(request);
    if (decision.outcome === "deny") return { decision, executed: false };
    if (decision.outcome === "approval_required") {
      if (!approveSensitive || !(await approveSensitive(decision))) {
        return { decision, executed: false };
      }
    }

    const result = await execute();
    return { decision, executed: true, result };
  }

  async #checkParentChain(
    permission: AgentPermission,
    user: AgentPermission["user"],
  ): Promise<PermissionDecision | null> {
    let child = permission;
    const visited = new Set([permission.permissionId]);

    while (child.parentPermissionId !== undefined || child.parentAgentId !== undefined) {
      if (!child.parentPermissionId || !child.parentAgentId) {
        return {
          outcome: "deny",
          reason: "PERMISSION_CHAIN_INVALID",
          permissionId: child.permissionId,
        };
      }

      const parent = await this.#store.getPermissionById(user, child.parentPermissionId);
      if (!parent) {
        return {
          outcome: "deny",
          reason: "PARENT_PERMISSION_NOT_FOUND",
          permissionId: child.permissionId,
        };
      }
      if (visited.has(parent.permissionId) || parent.agentId !== child.parentAgentId) {
        return {
          outcome: "deny",
          reason: "PERMISSION_CHAIN_INVALID",
          permissionId: child.permissionId,
        };
      }
      visited.add(parent.permissionId);

      if (parent.revokedAt !== undefined) {
        return {
          outcome: "deny",
          reason: "PARENT_PERMISSION_REVOKED",
          permissionId: child.permissionId,
        };
      }
      if (parent.expiresAt <= this.#now()) {
        return {
          outcome: "deny",
          reason: "PARENT_PERMISSION_EXPIRED",
          permissionId: child.permissionId,
        };
      }
      if (!isPermissionNarrower(child, parent)) {
        return {
          outcome: "deny",
          reason: "DELEGATION_EXCEEDS_PARENT",
          permissionId: child.permissionId,
        };
      }

      child = parent;
    }

    return null;
  }

  #checkInactive(permission: AgentPermission): PermissionDecision | null {
    if (permission.revokedAt !== undefined) {
      return {
        outcome: "deny",
        reason: "PERMISSION_REVOKED",
        permissionId: permission.permissionId,
      };
    }

    if (permission.expiresAt <= this.#now()) {
      return {
        outcome: "deny",
        reason: "PERMISSION_EXPIRED",
        permissionId: permission.permissionId,
      };
    }

    return null;
  }

  #checkAction(
    permissionId: string,
    request: ActionRequest,
    rule: ActionRule,
  ): PermissionDecision {
    if (
      rule.allowedServices &&
      (!request.service || !rule.allowedServices.includes(request.service))
    ) {
      return { outcome: "deny", reason: "SERVICE_NOT_ALLOWED", permissionId };
    }

    if (rule.currency && request.currency !== rule.currency) {
      return { outcome: "deny", reason: "CURRENCY_MISMATCH", permissionId };
    }

    if (
      rule.maxAmountMinor !== undefined &&
      request.amountMinor !== undefined &&
      request.amountMinor > rule.maxAmountMinor
    ) {
      return { outcome: "deny", reason: "AMOUNT_EXCEEDS_LIMIT", permissionId };
    }

    if (
      rule.requireApprovalAboveMinor !== undefined &&
      request.amountMinor !== undefined &&
      request.amountMinor > rule.requireApprovalAboveMinor
    ) {
      return {
        outcome: "approval_required",
        reason: "SENSITIVE_ACTION_REQUIRES_APPROVAL",
        permissionId,
      };
    }

    return { outcome: "allow", reason: "REQUEST_ALLOWED", permissionId };
  }
}
