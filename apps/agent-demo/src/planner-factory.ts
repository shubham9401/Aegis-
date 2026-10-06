import { KimiTravelPlanner } from "./kimi-planner.js";
import { LocalTravelPlanner, type TravelPlanner } from "./planner.js";

export function createPlanner(): TravelPlanner {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) return new LocalTravelPlanner();

  return new KimiTravelPlanner({
    apiKey,
    ...(process.env.KIMI_MODEL ? { model: process.env.KIMI_MODEL } : {}),
  });
}

export function plannerName(planner: TravelPlanner): "Kimi" | "local demo" {
  return planner instanceof KimiTravelPlanner ? "Kimi" : "local demo";
}

export async function planWithFallback(
  selectedPlanner: TravelPlanner,
  request: string,
): Promise<Awaited<ReturnType<TravelPlanner["plan"]>>> {
  try {
    return await selectedPlanner.plan(request);
  } catch (error) {
    if (!(selectedPlanner instanceof KimiTravelPlanner)) throw error;

    const reason = error instanceof Error ? error.message : "unknown Kimi API error";
    console.error("Kimi planning failed; using the local demo planner.");
    console.error(`Kimi error: ${redactProviderIdentifiers(reason)}`);
    return new LocalTravelPlanner().plan(request);
  }
}

function redactProviderIdentifiers(message: string): string {
  return message
    .replace(/org-[a-zA-Z0-9]+/g, "org-[redacted]")
    .replace(/<ak-[^>]+>/g, "<api-key-id-redacted>");
}
