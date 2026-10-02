export type Address = `0x${string}`;

export type DataScope =
  | "profile:dietary-preference"
  | "profile:travel-budget"
  | "profile:passport-validity";

export type AgentAction = "travel:search" | "travel:book";

export interface ActionRule {
  action: AgentAction;
  /** Maximum amount in the currency's smallest unit, such as cents. */
  maxAmountMinor?: bigint;
  currency?: string;
  allowedServices?: readonly string[];
  requireApprovalAboveMinor?: bigint;
}

export interface AgentPermission {
  permissionId: string;
  user: Address;
  agentId: string;
  dataScopes: readonly DataScope[];
  actionRules: readonly ActionRule[];
  expiresAt: number;
  revokedAt?: number;
}

interface RequestBase {
  requestId: string;
  user: Address;
  agentId: string;
  requestedAt: number;
}

export interface DataAccessRequest extends RequestBase {
  kind: "data";
  scope: DataScope;
}

export interface ActionRequest extends RequestBase {
  kind: "action";
  action: AgentAction;
  amountMinor?: bigint;
  currency?: string;
  service?: string;
}

export type AgentRequest = DataAccessRequest | ActionRequest;

export type DecisionReason =
  | "PERMISSION_NOT_FOUND"
  | "PERMISSION_REVOKED"
  | "PERMISSION_EXPIRED"
  | "DATA_SCOPE_NOT_GRANTED"
  | "ACTION_NOT_GRANTED"
  | "SERVICE_NOT_ALLOWED"
  | "CURRENCY_MISMATCH"
  | "AMOUNT_EXCEEDS_LIMIT"
  | "SENSITIVE_ACTION_REQUIRES_APPROVAL"
  | "REQUEST_ALLOWED";

export type PermissionDecision =
  | {
      outcome: "allow";
      reason: "REQUEST_ALLOWED";
      permissionId: string;
    }
  | {
      outcome: "deny";
      reason: Exclude<DecisionReason, "REQUEST_ALLOWED" | "SENSITIVE_ACTION_REQUIRES_APPROVAL">;
      permissionId?: string;
    }
  | {
      outcome: "approval_required";
      reason: "SENSITIVE_ACTION_REQUIRES_APPROVAL";
      permissionId: string;
    };

export interface PermissionStore {
  getPermission(user: Address, agentId: string): Promise<AgentPermission | null>;
}
