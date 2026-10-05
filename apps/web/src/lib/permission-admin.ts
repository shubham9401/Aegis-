// PermissionAdmin interface + DemoPermissionAdmin
// Adapts between the UI and the permission store (demo in-memory or contract)

import {
  MemoryPermissionStore,
  type Address,
  type AgentPermission,
} from "@aegis/sdk";

/**
 * PermissionAdmin: interface for granting/revoking/listing permissions.
 * DemoPermissionAdmin wraps the SDK's MemoryPermissionStore.
 * ContractPermissionAdmin will wrap viem writeContract/readContract.
 */
export interface PermissionAdmin {
  grant(p: AgentPermission): Promise<{ txHash?: `0x${string}` }>;
  revoke(user: Address, agentId: string): Promise<{ txHash?: `0x${string}` }>;
  list(user: Address): Promise<AgentPermission[]>;
}

// ─── globalThis singleton to survive Next.js hot reload & serverless ───

const globalStore = globalThis as unknown as {
  __aegis_store?: MemoryPermissionStore;
  __aegis_permissions?: Map<string, AgentPermission>;
};

function getStore(): MemoryPermissionStore {
  if (!globalStore.__aegis_store) {
    globalStore.__aegis_store = new MemoryPermissionStore();
    globalStore.__aegis_permissions = new Map();
  }
  return globalStore.__aegis_store;
}

function getPermissionMap(): Map<string, AgentPermission> {
  if (!globalStore.__aegis_permissions) {
    globalStore.__aegis_permissions = new Map();
  }
  return globalStore.__aegis_permissions;
}

export class DemoPermissionAdmin implements PermissionAdmin {
  async grant(p: AgentPermission): Promise<{ txHash?: `0x${string}` }> {
    const store = getStore();
    store.setPermission(p);
    // Also track in our map for listing
    const map = getPermissionMap();
    map.set(`${p.user.toLowerCase()}:${p.agentId}`, p);
    return {};
  }

  async revoke(user: Address, agentId: string): Promise<{ txHash?: `0x${string}` }> {
    const store = getStore();
    const now = Math.floor(Date.now() / 1000);
    store.revokePermission(user, agentId, now);
    // Update our tracking map
    const map = getPermissionMap();
    const key = `${user.toLowerCase()}:${agentId}`;
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, revokedAt: now });
    }
    return {};
  }

  async list(user: Address): Promise<AgentPermission[]> {
    const map = getPermissionMap();
    const results: AgentPermission[] = [];
    const prefix = user.toLowerCase();
    for (const [key, permission] of map) {
      if (key.startsWith(prefix + ":")) {
        // Re-read from the actual store for freshness
        const fresh = await getStore().getPermission(user, permission.agentId);
        if (fresh) results.push(fresh);
      }
    }
    return results;
  }
}

// TODO(OPEN): ContractPermissionAdmin — method names and struct from T1's ABI
// export class ContractPermissionAdmin implements PermissionAdmin {
//   // VERIFIED: <source> — fill from T1's deployed ABI when available
// }

/** Get the configured admin. */
export function getPermissionAdmin(): PermissionAdmin {
  const adapter = process.env.NEXT_PUBLIC_ADAPTER ?? "demo";
  if (adapter === "contract") {
    // TODO: return new ContractPermissionAdmin(...)
    throw new Error("Contract adapter not yet available. Set NEXT_PUBLIC_ADAPTER=demo");
  }
  return new DemoPermissionAdmin();
}

/** Get the shared PermissionStore for use with AegisClient. */
export function getPermissionStore(): MemoryPermissionStore {
  return getStore();
}
