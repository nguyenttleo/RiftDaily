import { env, isRiotApiConfigured } from "@/lib/env";

export interface ChampionRotationResponse {
  freeChampionIds: number[];
  freeChampionIdsForNewPlayers: number[];
  maxNewPlayerLevel: number;
}

export async function getChampionRotation(region = env.riotRegion): Promise<ChampionRotationResponse | null> {
  if (!isRiotApiConfigured()) {
    return null;
  }

  const response = await fetch(`https://${region}.api.riotgames.com/lol/platform/v3/champion-rotations`, {
    headers: {
      "X-Riot-Token": env.riotApiKey
    },
    next: { revalidate: 60 * 30 }
  });

  if (!response.ok) {
    throw new Error(`Riot API champion rotation request failed with ${response.status}`);
  }

  return (await response.json()) as ChampionRotationResponse;
}
