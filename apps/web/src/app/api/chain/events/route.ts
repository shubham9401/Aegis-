import { decodeEventLog } from "viem";
import { requireUser } from "@/lib/server-auth";
import { aegisAbi, chainJson, chainReader } from "@/lib/chain";
import { apiError } from "@/lib/utils";
export async function GET(request: Request) {
  const user = await requireUser(request); if (user instanceof Response) return user;
  try {
    const { client, config } = await chainReader();
    const latest = await client.getBlockNumber();
    const cursor = new URL(request.url).searchParams.get("before");
    if (cursor && !/^(0|[1-9]\d{0,20})$/.test(cursor)) return apiError(400, "INVALID_CURSOR");
    const to = cursor ? BigInt(cursor) : latest;
    if (to > latest) return apiError(400, "INVALID_CURSOR");
    const from = to > 999n ? to - 999n : 0n;
    const logs = await client.getLogs({ address: config.address, fromBlock: from, toBlock: to });
    const owners = new Map<string, string>();
    const events = [];
    for (const log of logs) {
      if (log.removed) continue;
      const event = decodeEventLog({ abi: aegisAbi, data: log.data, topics: log.topics });
      const args = event.args as Record<string, unknown>;
      let owner = typeof args.user === "string" ? args.user : undefined;
      if (!owner && typeof args.permissionId === "bigint") {
        const id = args.permissionId.toString();
        owner = owners.get(id);
        if (!owner) {
          const p = await client.readContract({ address: config.address, abi: aegisAbi, functionName: "getPermission", args: [args.permissionId] });
          owner = p.user; owners.set(id, owner);
        }
      }
      if (owner?.toLowerCase() !== user.toLowerCase()) continue;
      events.push({ name: event.eventName, args, block: log.blockNumber, hash: log.transactionHash, index: log.logIndex });
    }
    return chainJson({ events: events.reverse(), fromBlock: from, toBlock: to, nextBefore: from > 0n ? from - 1n : null });
  } catch { return apiError(503, "EVENTS_UNAVAILABLE", "Monad event lookup failed. Retry without using this feed for authorization."); }
}
