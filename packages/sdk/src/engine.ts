import type {
  ActionRequest,
  ActionRule,
  AgentPermission,
  AgentRequest,
  PermissionDecision,
  PermissionStore,
} from "./types.js";

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
