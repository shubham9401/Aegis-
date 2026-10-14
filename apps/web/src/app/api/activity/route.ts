// GET /api/activity?user= — Merged activity feed
// Combines contract events (Envio if available) + denial log

import { NextRequest } from "next/server";
import { getActivityShared } from "@/lib/activity-log";
import { activityQuerySchema } from "@/lib/validation";
import { apiError } from "@/lib/utils";
import type { Address } from "@aegis/sdk";
import { requireUser } from "@/lib/server-auth";
import { getEnvioActivity } from "@/lib/envio-activity";

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
  const local = await getActivityShared(user as Address, limit);
  let indexed: typeof local = [];
  let indexerAvailable = false;
  try {
    indexed = await getEnvioActivity(user as Address, limit);
    indexerAvailable = Boolean(process.env.ENVIO_GRAPHQL_URL?.trim());
  } catch { /* The display index may lag or be offline; local denials remain available. */ }
  const activity = [...indexed, ...local]
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.id === entry.id) === index)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  // The indexer is a display accelerator; authorization uses live contract checks.
  return Response.json({ activity, indexerAvailable }, { headers: { "Cache-Control": "no-store" } });
  } catch { return apiError(503, "ACTIVITY_UNAVAILABLE", "Activity storage is unavailable"); }
}
