import type { Address, DataScope } from "./types.js";

export type Bytes32 = `0x${string}`;

export const CONTRACT_DATA_ACTION: Readonly<Record<DataScope, bigint>> = {
  "profile:dietary-preference": 1n,
  "profile:travel-budget": 16n,
  "profile:passport-validity": 32n,
};

export interface ContractPermissionSnapshot {
  user: Address;
  agent: Address;
  agentId: bigint;
  scope: Bytes32;
}

export interface ContractPermissionReader {
  getPermission(permissionId: bigint): Promise<ContractPermissionSnapshot>;
  checkPermission(
    permissionId: bigint,
    actor: Address,
    action: bigint,
    scope: Bytes32,
  ): Promise<bigint>;
}

export interface ContractDataAccessRequest {
  permissionId: bigint;
  user: Address;
  agentId: bigint;
  actor: Address;
  dataScope: DataScope;
  expectedResourceScope?: Bytes32;
}

export type ContractDataDecision =
  | {
      outcome: "allow";
      reason: "REQUEST_ALLOWED";
      permissionId: bigint;
      resourceScope: Bytes32;
      action: bigint;
    }
  | {
      outcome: "deny";
      reason:
        | "INVALID_PERMISSION_ID"
        | "USER_MISMATCH"
        | "AGENT_ID_MISMATCH"
        | "AGENT_ADDRESS_MISMATCH"
        | "RESOURCE_SCOPE_MISMATCH"
        | "CONTRACT_DENIED";
      permissionId: bigint;
      contractStatus?: bigint;
    };

/**
 * Fail-closed bridge between Aegis' semantic data scopes and the Monad
 * permission contract. The caller remains responsible for authenticating the
 * actor; this gate verifies that identity against the live grant immediately
 * before a vault releases data.
 */
export class ContractPermissionGate {
  readonly #reader: ContractPermissionReader;

  constructor(reader: ContractPermissionReader) {
    this.#reader = reader;
  }

  async checkDataAccess(request: ContractDataAccessRequest): Promise<ContractDataDecision> {
    if (request.permissionId <= 0n) {
      return { outcome: "deny", reason: "INVALID_PERMISSION_ID", permissionId: request.permissionId };
    }

    const permission = await this.#reader.getPermission(request.permissionId);
    if (!sameAddress(permission.user, request.user)) {
      return { outcome: "deny", reason: "USER_MISMATCH", permissionId: request.permissionId };
    }
    if (permission.agentId !== request.agentId) {
      return { outcome: "deny", reason: "AGENT_ID_MISMATCH", permissionId: request.permissionId };
    }
    if (!sameAddress(permission.agent, request.actor)) {
      return { outcome: "deny", reason: "AGENT_ADDRESS_MISMATCH", permissionId: request.permissionId };
    }
    if (
      request.expectedResourceScope &&
      permission.scope.toLowerCase() !== request.expectedResourceScope.toLowerCase()
    ) {
      return { outcome: "deny", reason: "RESOURCE_SCOPE_MISMATCH", permissionId: request.permissionId };
    }

    const action = CONTRACT_DATA_ACTION[request.dataScope];
    const status = await this.#reader.checkPermission(
      request.permissionId,
      request.actor,
      action,
      permission.scope,
    );
    if (status !== 0n) {
      return {
        outcome: "deny",
        reason: "CONTRACT_DENIED",
        permissionId: request.permissionId,
        contractStatus: status,
      };
    }

    return {
      outcome: "allow",
      reason: "REQUEST_ALLOWED",
      permissionId: request.permissionId,
      resourceScope: permission.scope,
      action,
    };
  }
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
