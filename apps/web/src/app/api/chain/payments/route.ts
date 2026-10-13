import { z } from "zod";
import { requireUser, checkOrigin, authRateLimit } from "@/lib/server-auth";
import { chainJson } from "@/lib/chain";
import { authenticatePayment, enqueuePayment, listChainPayments, paymentState, rejectPayment } from "@/lib/chain-requests";
import { apiError, parseBody } from "@/lib/utils";
const hex32 = z.string().regex(/^0x[\da-fA-F]{64}$/).refine((s) => BigInt(s) !== 0n);
const uint = z.string().regex(/^[1-9]\d{0,77}$/).refine((s) => BigInt(s) < 2n ** 256n);
const schema = z.object({ permissionId: uint, requestId: hex32, recipient: z.string().regex(/^0x[\da-fA-F]{40}$/), amount: uint,
  deadline: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), signature: z.string().regex(/^0x[\da-fA-F]{130}$/) }).strict();
export async function GET(request: Request) {
  const user = await requireUser(request); if (user instanceof Response) return user;
  try { return chainJson({ payments: await listChainPayments(user) }); }
  catch { return apiError(503, "PAYMENTS_UNAVAILABLE", "Unable to verify pending payments against Monad."); }
}
export async function POST(request: Request) {
  const origin = checkOrigin(request); if (origin) return origin;
  const rate = authRateLimit("chain-payment-requests", 60); if (rate) return rate;
  const input = await parseBody(request, schema); if (input instanceof Response) return input;
  try {
    const typed = { ...input, requestId: input.requestId as `0x${string}`, recipient: input.recipient as `0x${string}`, signature: input.signature as `0x${string}` };
    const { permission } = await authenticatePayment(typed, process.env.AEGIS_APP_ORIGIN || new URL(request.url).origin);
    const entry = enqueuePayment(typed, permission.user, permission.agentId, permission.rootId);
    return chainJson(await paymentState(entry));
  } catch { return apiError(403, "PAYMENT_REQUEST_DENIED", "Check the signature, live permission, recipient, deadline and request ID."); }
}
export async function DELETE(request: Request) {
  const user = await requireUser(request); if (user instanceof Response) return user;
  const body = await parseBody(request, z.object({ requestId: hex32 }).strict()); if (body instanceof Response) return body;
  try { rejectPayment(user, body.requestId); return chainJson({ rejected: true }); }
  catch { return apiError(404, "REQUEST_NOT_FOUND"); }
}
