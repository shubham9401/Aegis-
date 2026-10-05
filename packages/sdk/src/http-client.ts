import type { Address, AgentAction, DataScope } from "./types.js";

export interface AegisApiClientOptions {
  baseUrl: string;
  agentToken: string;
  fetchImpl?: typeof fetch;
}

export interface ContextRequest {
  user: Address;
  agentId: string;
  scope: DataScope;
}

export interface ContextRelease {
  scope: DataScope;
  value: string;
}

export interface ApprovalRequestInput {
  permissionId: string;
  requestId: string;
  user: Address;
  agentId: string;
  action: AgentAction;
  amountMinor: string;
  currency: string;
  service: string;
  deadline: number;
  agentNote?: string;
}

export interface ApprovalRequestRecord extends ApprovalRequestInput {
  approvalId: string;
  requestedAt: number;
}

export type ApprovalResult =
  | { approvalId: string; outcome: "pending" }
  | {
      approvalId: string;
      outcome: "approved";
      signer: Address;
      signature: `0x${string}`;
      nonce: `0x${string}`;
      signedAt: number;
    }
  | { approvalId: string; outcome: "rejected"; signedAt: number };

export interface ApprovalRecord {
  request: ApprovalRequestRecord;
  result: ApprovalResult;
}

export interface WaitForApprovalOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Error returned by the Aegis HTTP boundary with its machine-readable reason. */
export class AegisApiError extends Error {
  readonly status: number;
  readonly reason: string;
  readonly detail?: string;

  constructor(status: number, reason: string, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "AegisApiError";
    this.status = status;
    this.reason = reason;
    if (detail !== undefined) this.detail = detail;
  }
}

/**
 * Agent-side client for Aegis' protected context and approval endpoints.
 * Authorization decisions remain in the deterministic SDK/contract boundary;
 * this client only transports requests and never treats model output as consent.
 */
export class AegisApiClient {
  readonly #baseUrl: string;
  readonly #agentToken: string;
  readonly #fetch: typeof fetch;

  constructor({ baseUrl, agentToken, fetchImpl = globalThis.fetch }: AegisApiClientOptions) {
    if (!baseUrl) throw new Error("Aegis API base URL is required");
    if (!agentToken) throw new Error("Aegis agent token is required");
    if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");

    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#agentToken = agentToken;
    this.#fetch = fetchImpl;
  }

  async requestContext(request: ContextRequest): Promise<ContextRelease> {
    const query = new URLSearchParams({ user: request.user, agentId: request.agentId });
    return this.#request<ContextRelease>(
      `/api/context/${encodeURIComponent(request.scope)}?${query.toString()}`,
      { method: "GET" },
      true,
    );
  }

  async requestApproval(request: ApprovalRequestInput): Promise<ApprovalRecord> {
    return this.#request<ApprovalRecord>(
      "/api/approvals",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
      true,
    );
  }

  async getApproval(approvalId: string): Promise<ApprovalRecord> {
    if (!approvalId) throw new Error("Approval ID is required");
    return this.#request<ApprovalRecord>(
      `/api/approvals/${encodeURIComponent(approvalId)}`,
      { method: "GET" },
      false,
    );
  }

  async waitForApproval(
    approvalId: string,
    { intervalMs = 1_000, timeoutMs = 120_000, signal }: WaitForApprovalOptions = {},
  ): Promise<ApprovalRecord> {
    if (intervalMs < 0) throw new Error("Approval polling interval cannot be negative");
    if (timeoutMs <= 0) throw new Error("Approval timeout must be positive");

    const startedAt = Date.now();
    while (true) {
      if (signal?.aborted) throw new DOMException("Approval wait aborted", "AbortError");

      const approval = await this.getApproval(approvalId);
      if (approval.result.outcome !== "pending") return approval;
      if (approval.request.deadline <= Math.floor(Date.now() / 1_000)) {
        throw new Error(`Approval ${approvalId} expired before the user decided`);
      }
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out waiting for approval ${approvalId}`);
      }

      await delay(intervalMs, signal);
    }
  }

  async #request<T>(path: string, init: RequestInit, authenticated: boolean): Promise<T> {
    const headers = new Headers(init.headers);
    if (authenticated) headers.set("Authorization", `Bearer ${this.#agentToken}`);

    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
    const payload = await readJson(response);
    if (!response.ok) {
      const error = isRecord(payload) && typeof payload.error === "string" ? payload.error : "AEGIS_API_ERROR";
      const detail = isRecord(payload) && typeof payload.detail === "string" ? payload.detail : undefined;
      throw new AegisApiError(response.status, error, detail);
    }

    return payload as T;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AegisApiError(response.status, "INVALID_RESPONSE", "Aegis returned non-JSON data");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Approval wait aborted", "AbortError"));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
