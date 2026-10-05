import type { Address, AgentPermission, PermissionStore } from "./types.js";

/** Demo-only store. Replace this with the Monad contract adapter once its ABI is agreed. */
export class MemoryPermissionStore implements PermissionStore {
  readonly #permissions = new Map<string, AgentPermission>();

  constructor(initialPermissions: readonly AgentPermission[] = []) {
    for (const permission of initialPermissions) this.setPermission(permission);
  }

  async getPermission(user: Address, agentId: string): Promise<AgentPermission | null> {
    return this.#permissions.get(this.#key(user, agentId)) ?? null;
  }

  async getPermissionById(user: Address, permissionId: string): Promise<AgentPermission | null> {
    for (const permission of this.#permissions.values()) {
      if (
        permission.user.toLowerCase() === user.toLowerCase() &&
        permission.permissionId === permissionId
      ) {
        return permission;
      }
    }

    return null;
  }

  setPermission(permission: AgentPermission): void {
    const duplicateId = [...this.#permissions.values()].some(
      (existing) =>
        existing.user.toLowerCase() === permission.user.toLowerCase() &&
        existing.permissionId === permission.permissionId &&
        existing.agentId !== permission.agentId,
    );
    if (duplicateId) throw new Error("Permission IDs must be unique per user");

    this.#permissions.set(this.#key(permission.user, permission.agentId), permission);
  }

  delegatePermission(parentAgentId: string, permission: AgentPermission): void {
    const parent = this.#permissions.get(this.#key(permission.user, parentAgentId));
    if (!parent) throw new Error("Cannot delegate from a missing parent permission");
    if (permission.parentPermissionId !== parent.permissionId) {
      throw new Error("Delegated permission must reference its parent permission");
    }

    this.setPermission(permission);
  }

  revokePermission(user: Address, agentId: string, revokedAt: number): void {
    const key = this.#key(user, agentId);
    const permission = this.#permissions.get(key);
    if (!permission) return;

    this.#permissions.set(key, { ...permission, revokedAt });
  }

  #key(user: Address, agentId: string): string {
    return `${user.toLowerCase()}:${agentId}`;
  }
}
