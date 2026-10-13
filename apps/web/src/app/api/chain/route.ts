import { requireUser } from "@/lib/server-auth";
import { chainJson, userChainState } from "@/lib/chain";
import { apiError } from "@/lib/utils";
export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const cursor = new URL(request.url).searchParams.get("cursor") || "1";
  if (!/^[1-9]\d{0,76}$/.test(cursor)) return apiError(400, "INVALID_CURSOR");
  try { return chainJson(await userChainState(user, BigInt(cursor))); }
  catch { return apiError(503, "CHAIN_UNAVAILABLE", "Check contract mode, resource scope and Monad RPC configuration."); }
}
