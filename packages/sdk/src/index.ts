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
  type ContextProof,
  type ContextProofProvider,
  type WaitForApprovalOptions,
} from "./http-client.js";
export { createDelegatedPermission, type DelegatedPermissionInput } from "./delegation.js";
export {
  CONTRACT_DATA_ACTION,
  ContractPermissionGate,
  type Bytes32,
  type ContractDataAccessRequest,
  type ContractDataDecision,
  type ContractPermissionReader,
  type ContractPermissionSnapshot,
} from "./contract-gate.js";
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
