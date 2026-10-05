// GET /api/activity?user= — Merged activity feed
// Combines contract events (Envio if available) + denial log

import { NextRequest } from "next/server";
import { getActivity } from "@/lib/activity-log";
import { activityQuerySchema } from "@/lib/validation";
import { apiError } from "@/lib/utils";
import type { Address } from "@aegis/sdk";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const result = activityQuerySchema.safeParse({
    user: url.searchParams.get("user"),
    limit: url.searchParams.get("limit"),
  });

  if (!result.success) {
    return apiError(400, "VALIDATION_ERROR", result.error.message);
  }

  const { user, limit } = result.data;
  const activity = getActivity(user as Address, limit);

  // TODO: merge with Envio events when T3 delivers the GraphQL endpoint
  // const envioUrl = process.env.NEXT_PUBLIC_ENVIO_URL;
  // if (envioUrl) { ... }

  return Response.json({ activity });
}
