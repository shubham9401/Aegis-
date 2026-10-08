// GET /api/activity?user= — Merged activity feed
// Combines contract events (Envio if available) + denial log

import { NextRequest } from "next/server";
import { getActivity } from "@/lib/activity-log";
import { activityQuerySchema } from "@/lib/validation";
import { apiError } from "@/lib/utils";
import type { Address } from "@aegis/sdk";
import { requireUser } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  try {
  const url = new URL(request.url);

  const result = activityQuerySchema.safeParse({
    user: url.searchParams.get("user"),
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!result.success) {
    return apiError(400, "VALIDATION_ERROR", result.error.message);
  }

  const { user, limit } = result.data;
  const authorization = await requireUser(request, user);
  if (authorization instanceof Response) return authorization;
  const activity = getActivity(user as Address, limit);

  // TODO: merge with Envio events when T3 delivers the GraphQL endpoint
  // const envioUrl = process.env.NEXT_PUBLIC_ENVIO_URL;
  // if (envioUrl) { ... }

  return Response.json({ activity }, { headers: { "Cache-Control": "no-store" } });
  } catch { return apiError(503, "ACTIVITY_UNAVAILABLE", "Activity storage is unavailable"); }
}
