// Zod validation schemas for all API routes
import { z } from "zod";

// ─── Shared ───

export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address") as z.ZodType<`0x${string}`>;

export const dataScopeSchema = z.enum([
  "profile:dietary-preference",
  "profile:travel-budget",
  "profile:passport-validity",
]);

export const agentActionSchema = z.enum(["travel:search", "travel:book"]);
export const amountMinorSchema = z.string().regex(/^(0|[1-9]\d{0,77})$/)
  .refine((value) => /^\d+$/.test(value) && BigInt(value) < BigInt(2) ** BigInt(256), "Amount exceeds uint256");
const identifierSchema = z.string().trim().min(1).max(256);
const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code");

// ─── Permission Grant ───

export const actionRuleSchema = z.object({
  action: agentActionSchema,
  maxAmountMinor: amountMinorSchema.optional(),
  currency: currencySchema.optional(),
  allowedServices: z.array(identifierSchema).max(32).optional(),
  requireApprovalAboveMinor: amountMinorSchema.optional(),
});

export const grantPermissionSchema = z.object({
  agentId: identifierSchema,
  dataScopes: z.array(dataScopeSchema).max(3),
  actionRules: z.array(actionRuleSchema).max(2),
  expiresInSeconds: z.number().int().positive().max(604800), // max 7 days
}).superRefine((permission, context) => {
  if (!permission.dataScopes.length && !permission.actionRules.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Grant at least one scope or action" });
  }
  if (new Set(permission.dataScopes).size !== permission.dataScopes.length ||
      new Set(permission.actionRules.map((rule) => rule.action)).size !== permission.actionRules.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate scopes or action rules" });
  }
  for (const rule of permission.actionRules) {
    if (rule.maxAmountMinor && rule.requireApprovalAboveMinor && /^\d+$/.test(rule.maxAmountMinor) && /^\d+$/.test(rule.requireApprovalAboveMinor) &&
        BigInt(rule.requireApprovalAboveMinor) > BigInt(rule.maxAmountMinor)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Approval threshold exceeds the spending limit" });
    }
  }
});

// ─── Vault ───

export const vaultWriteSchema = z.object({
  scope: dataScopeSchema,
  value: z.string().min(1).max(1000),
});

export const vaultBatchWriteSchema = z.object({
  entries: z.array(vaultWriteSchema).min(1).max(3)
    .refine((entries) => new Set(entries.map((entry) => entry.scope)).size === entries.length, "Duplicate scopes"),
});

// ─── Context Route ───

export const contextQuerySchema = z.object({
  user: addressSchema,
  agentId: identifierSchema,
});

// ─── Approval ───

export const createApprovalSchema = z.object({
  permissionId: identifierSchema,
  requestId: z.string().uuid(),
  user: addressSchema,
  agentId: identifierSchema,
  action: agentActionSchema,
  amountMinor: amountMinorSchema,
  currency: currencySchema,
  service: identifierSchema,
  deadline: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  agentNote: z.string().max(500).optional(),
});

export const approvalDecisionSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("approved"),
    signer: addressSchema,
    signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, "Expected a 65-byte signature"),
    nonce: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Expected a bytes32 nonce"),
    signedAt: z.number().int().positive().optional(),
  }),
  z.object({
    outcome: z.literal("rejected"),
    signedAt: z.number().int().positive().optional(),
  }),
]);

// ─── Agent Plan ───

export const agentPlanRequestSchema = z.object({
  userRequest: z.string().min(1).max(2000),
});

// ─── Activity ───

export const activityQuerySchema = z.object({
  user: addressSchema,
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});
