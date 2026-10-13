// PermissionAdmin interface + DemoPermissionAdmin
// Local durable adapter. Contract mapping is an unresolved team interface.

import {
  MemoryPermissionStore,
  type Address,
  type AgentPermission,
} from "@aegis/sdk";
import { readLocalStore, writeLocalStore } from "./local-store";
import { z } from "zod";
import { actionRuleSchema, addressSchema, dataScopeSchema } from "./validation";
import {
  aegisContractAbi,
  contractRecordToPermission,
  getContractPublicClient,
  getServerContractConfig,
} from "./aegis-contract";

const persistedPermissionSchema = z.object({
  permissionId: z.string().min(1).max(256),
  user: addressSchema,
  agentId: z.string().min(1).max(256),
  dataScopes: z.array(dataScopeSchema).max(3),
  actionRules: z.array(actionRuleSchema).max(2),
  expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  revokedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  parentPermissionId: z.string().min(1).max(256).optional(),
  parentAgentId: z.string().min(1).max(256).optional(),
});

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

// Shared within one process; durable state is reloaded after restarts.

const globalStore = globalThis as unknown as {
  __aegis_store?: MemoryPermissionStore;
  __aegis_permissions?: Map<string, AgentPermission>;
};

function getStore(): MemoryPermissionStore {
  if (!globalStore.__aegis_store) {
    const saved = z.array(persistedPermissionSchema).parse(readLocalStore<unknown>("permissions.json", []));
    const permissions = saved.map(deserializePermission);
    globalStore.__aegis_store = new MemoryPermissionStore(permissions);
    globalStore.__aegis_permissions = new Map(permissions.map((p) => [permissionKey(p.user, p.agentId), p]));
  }
  return globalStore.__aegis_store;
}

function getPermissionMap(): Map<string, AgentPermission> {
  getStore();
  if (!globalStore.__aegis_permissions) {
    globalStore.__aegis_permissions = new Map();
  }
  return globalStore.__aegis_permissions;
}

export class DemoPermissionAdmin implements PermissionAdmin {
  async grant(p: AgentPermission): Promise<{ txHash?: `0x${string}` }> {
    const store = getStore();
    const map = getPermissionMap();
    const next = new Map(map);
    next.set(permissionKey(p.user, p.agentId), p);
    persist(next);
    store.setPermission(p);
    globalStore.__aegis_permissions = next;
    return {};
  }

  async revoke(user: Address, agentId: string): Promise<{ txHash?: `0x${string}` }> {
    const store = getStore();
    const now = Math.floor(Date.now() / 1000);
    // Update our tracking map
    const map = getPermissionMap();
    const key = `${user.toLowerCase()}:${agentId}`;
    const existing = map.get(key);
    if (existing) {
      const next = new Map(map);
      next.set(key, { ...existing, revokedAt: existing.revokedAt ?? now });
      persist(next);
      store.revokePermission(user, agentId, existing.revokedAt ?? now);
      globalStore.__aegis_permissions = next;
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

export class ContractPermissionAdmin implements PermissionAdmin {
  async grant(): Promise<never> {
    throw new Error("Contract grants must be signed by the user's passkey in the browser.");
  }

  async revoke(): Promise<never> {
    throw new Error("Contract revocations must be signed by the user's passkey in the browser.");
  }

  async list(user: Address): Promise<AgentPermission[]> {
    const client = getContractPublicClient();
    const { address } = getServerContractConfig();
    const nextPermissionId = await client.readContract({
      address,
      abi: aegisContractAbi,
      functionName: "nextPermissionId",
    });
    const ids = Array.from({ length: Number(nextPermissionId - 1n) }, (_, index) => BigInt(index + 1));
    const permissions = await Promise.all(ids.map(async (id) => {
      const [record, status] = await Promise.all([
        client.readContract({ address, abi: aegisContractAbi, functionName: "getPermission", args: [id] }),
        client.readContract({ address, abi: aegisContractAbi, functionName: "permissionStatus", args: [id] }),
      ]);
      return contractRecordToPermission(id, record, Number(status));
    }));
    return permissions.filter((permission) => permission.user.toLowerCase() === user.toLowerCase());
  }
}

/** Get the configured admin. */
export function getPermissionAdmin(): PermissionAdmin {
  const adapter = process.env.NEXT_PUBLIC_ADAPTER ?? "demo";
  if (adapter === "contract") {
    return new ContractPermissionAdmin();
  }
  if (adapter !== "demo") throw new Error("Unsupported permission adapter");
  return new DemoPermissionAdmin();
}

/** Get the shared PermissionStore for use with AegisClient. */
export function getPermissionStore(): MemoryPermissionStore {
  // Fail closed: contract mode must never accidentally authorize from local state.
  if ((process.env.NEXT_PUBLIC_ADAPTER ?? "demo") === "contract") {
    throw new Error("The local permission store is disabled in contract mode.");
  }
  getPermissionAdmin();
  return getStore();
}

type SerializedPermission = Omit<AgentPermission, "actionRules"> & {
  actionRules: Array<Omit<AgentPermission["actionRules"][number], "maxAmountMinor" | "requireApprovalAboveMinor"> & {
    maxAmountMinor?: string;
    requireApprovalAboveMinor?: string;
  }>;
};

function permissionKey(user: Address, agentId: string): string {
  return `${user.toLowerCase()}:${agentId}`;
}

function persist(permissions: Map<string, AgentPermission>): void {
  writeLocalStore("permissions.json", [...permissions.values()].map((p) => ({
    ...p,
    actionRules: p.actionRules.map((r) => ({
      ...r,
      maxAmountMinor: r.maxAmountMinor?.toString(),
      requireApprovalAboveMinor: r.requireApprovalAboveMinor?.toString(),
    })),
  })));
}

function deserializePermission(p: SerializedPermission): AgentPermission {
  return {
    ...p,
    actionRules: p.actionRules.map((r) => ({
      ...r,
      maxAmountMinor: r.maxAmountMinor === undefined ? undefined : BigInt(r.maxAmountMinor),
      requireApprovalAboveMinor: r.requireApprovalAboveMinor === undefined ? undefined : BigInt(r.requireApprovalAboveMinor),
    })),
  };
}
