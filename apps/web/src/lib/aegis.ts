// AegisClient singleton — shared across all server routes

import { AegisClient } from "@aegis/sdk";
import { getPermissionStore } from "./permission-admin";

const globalAegis = globalThis as unknown as { __aegis_client?: AegisClient };

export function getAegisClient(): AegisClient {
  if (!globalAegis.__aegis_client) {
    globalAegis.__aegis_client = new AegisClient({
      store: getPermissionStore(),
    });
  }
  return globalAegis.__aegis_client;
}
