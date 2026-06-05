import { champions } from "@/game/data/champions";
import type { Champion, PublicChampion } from "@/types";

const DATA_DRAGON_BASE = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "15.10.1";

let cachedVersion: string | null = null;

export async function getLatestDataDragonVersion(): Promise<string> {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    const response = await fetch(`${DATA_DRAGON_BASE}/api/versions.json`, {
      next: { revalidate: 60 * 60 * 12 }
    });

    if (!response.ok) {
      return FALLBACK_VERSION;
    }

    const versions = (await response.json()) as string[];
    cachedVersion = versions[0] ?? FALLBACK_VERSION;
    return cachedVersion;
  } catch {
    return FALLBACK_VERSION;
  }
}

export function championSquareUrl(version: string, championId: string): string {
  return `${DATA_DRAGON_BASE}/cdn/${version}/img/champion/${championId}.png`;
}

export function championSplashUrl(championId: string, skin = 0): string {
  return `${DATA_DRAGON_BASE}/cdn/img/champion/splash/${championId}_${skin}.jpg`;
}

export function toPublicChampion(champion: Champion, version: string): PublicChampion {
  return {
    id: champion.id,
    name: champion.name,
    title: champion.title,
    roles: champion.roles,
    region: champion.region,
    resource: champion.resource,
    gender: champion.gender,
    releaseYear: champion.releaseYear,
    squareUrl: championSquareUrl(version, champion.id),
    splashUrl: championSplashUrl(champion.id)
  };
}

export async function getPublicChampions(): Promise<PublicChampion[]> {
  const version = await getLatestDataDragonVersion();
  return champions.map((champion) => toPublicChampion(champion, version));
}

export interface RiotChampionPayload {
  type: string;
  format: string;
  version: string;
  data: Record<
    string,
    {
      id: string;
      key: string;
      name: string;
      title: string;
      tags: string[];
      partype: string;
      image: {
        full: string;
      };
      passive: {
        name: string;
        description: string;
      };
      spells: Array<{
        id: string;
        name: string;
        description: string;
      }>;
    }
  >;
}

export async function fetchRiotChampionPayload(version?: string): Promise<RiotChampionPayload> {
  const resolvedVersion = version ?? (await getLatestDataDragonVersion());
  const response = await fetch(`${DATA_DRAGON_BASE}/cdn/${resolvedVersion}/data/en_US/champion.json`, {
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) {
    throw new Error(`Data Dragon champion fetch failed with ${response.status}`);
  }

  return (await response.json()) as RiotChampionPayload;
}
