import "server-only";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Local single-process deployment only; use a transactional database for replicas.
function storageDirectory(): string {
  // Runtime private state must never be traced into deployment bundles.
  return resolve(/* turbopackIgnore: true */ process.env.AEGIS_DATA_DIR ?? ".aegis-data");
}

export function readLocalStore<T>(name: string, empty: T): T {
  try {
    return JSON.parse(readFileSync(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ storageDirectory(), name), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty;
    throw new Error(`Cannot read ${name}; refusing to reset existing state`, { cause: error });
  }
}

export function writeLocalStore(name: string, value: unknown): void {
  const directory = storageDirectory();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const destination = join(/* turbopackIgnore: true */ directory, name);
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, destination);
}
