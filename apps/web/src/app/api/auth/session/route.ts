import { NextResponse } from "next/server";
import { requireUser, endSession } from "@/lib/server-auth";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const user = await requireUser(request);
  return user instanceof Response ? user : NextResponse.json({ address: user }, { headers: { "Cache-Control": "no-store" } });
}
export const DELETE = endSession;
