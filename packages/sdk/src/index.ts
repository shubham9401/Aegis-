export { AegisClient, type AegisClientOptions } from "./engine.js";
export {
  AegisApiClient,
  AegisApiError,
  type AegisApiClientOptions,
  type ApprovalRecord,
  type ApprovalRequestInput,
  type ApprovalRequestRecord,
  type ApprovalResult,
  type ContextRelease,
  type ContextRequest,
  type WaitForApprovalOptions,
} from "./http-client.js";
export { createDelegatedPermission, type DelegatedPermissionInput } from "./delegation.js";
export { MemoryPermissionStore } from "./memory-store.js";
export type {
  ActionRequest,
  ActionRule,
  Address,
  AgentAction,
  AgentPermission,
  AgentRequest,
  DataAccessRequest,
  DataScope,
  DecisionReason,
  PermissionDecision,
  PermissionStore,
} from "./types.js";
