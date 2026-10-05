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

// ─── Permission Grant ───

export const actionRuleSchema = z.object({
  action: agentActionSchema,
  maxAmountMinor: z.string().regex(/^\d+$/).optional(),
  currency: z.string().min(1).optional(),
  allowedServices: z.array(z.string().min(1)).optional(),
  requireApprovalAboveMinor: z.string().regex(/^\d+$/).optional(),
});

export const grantPermissionSchema = z.object({
  agentId: z.string().min(1),
  dataScopes: z.array(dataScopeSchema).min(1),
  actionRules: z.array(actionRuleSchema),
  expiresInSeconds: z.number().int().positive().max(604800), // max 7 days
});

// ─── Vault ───

export const vaultWriteSchema = z.object({
  scope: dataScopeSchema,
  value: z.string().min(1).max(1000),
});

export const vaultBatchWriteSchema = z.object({
  entries: z.array(vaultWriteSchema).min(1).max(10),
});

// ─── Context Route ───

export const contextQuerySchema = z.object({
  user: addressSchema,
  agentId: z.string().min(1),
});

// ─── Approval ───

export const createApprovalSchema = z.object({
  permissionId: z.string().min(1),
  requestId: z.string().uuid(),
  user: addressSchema,
  agentId: z.string().min(1),
  action: agentActionSchema,
  amountMinor: z.string().regex(/^\d+$/),
  currency: z.string().min(1),
  service: z.string().min(1),
  deadline: z.number().int().positive(),
  agentNote: z.string().max(500).optional(),
});

export const approvalDecisionSchema = z.object({
  outcome: z.enum(["approved", "rejected"]),
  signer: addressSchema.optional(),
  signature: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/)
    .optional() as z.ZodType<`0x${string}` | undefined>,
  nonce: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/)
    .optional() as z.ZodType<`0x${string}` | undefined>,
  signedAt: z.number().int().positive().optional(),
});

// ─── Agent Plan ───

export const agentPlanRequestSchema = z.object({
  userRequest: z.string().min(1).max(2000),
});

// ─── Activity ───

export const activityQuerySchema = z.object({
  user: addressSchema,
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});
