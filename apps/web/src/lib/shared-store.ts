import "server-only";
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

/** Vercel functions have no durable writable filesystem or shared memory. */
export function sharedStoreEnabled(): boolean {
  if (process.env.AEGIS_STORAGE_BACKEND === "redis") return true;
  if (process.env.VERCEL) throw new Error("AEGIS_STORAGE_BACKEND=redis is required on Vercel");
  return false;
}

let client: Redis | undefined;
export function sharedStore(): Redis {
  if (!sharedStoreEnabled()) throw new Error("Shared storage is not enabled");
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const origin = process.env.AEGIS_APP_ORIGIN;
  if (!url || !token || !origin) throw new Error("Redis and AEGIS_APP_ORIGIN must be configured");
  return client ??= new Redis({ url, token });
}

export function storeKey(suffix: string): string {
  const origin = process.env.AEGIS_APP_ORIGIN;
  if (!origin) throw new Error("AEGIS_APP_ORIGIN must be configured");
  const namespace = createHash("sha256").update(origin).digest("hex").slice(0, 16);
  return `aegis:${namespace}:${suffix}`;
}
