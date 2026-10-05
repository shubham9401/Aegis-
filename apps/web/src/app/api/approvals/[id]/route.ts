// GET /api/approvals/:id — Get approval by ID (agent polls this)

import { NextRequest } from "next/server";
import { getApproval } from "@/lib/approval-store";
import { apiError } from "@/lib/utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const approval = getApproval(id);
  if (!approval) {
    return apiError(404, "NOT_FOUND", "Approval not found");
  }
  return Response.json(approval);
}
