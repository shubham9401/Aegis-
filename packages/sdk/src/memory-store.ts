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

  setPermission(permission: AgentPermission): void {
    this.#permissions.set(this.#key(permission.user, permission.agentId), permission);
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
