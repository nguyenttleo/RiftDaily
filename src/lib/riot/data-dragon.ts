import { champions, items } from "@/game/data/champions";
import type { Champion, GameItem, PublicChampion, SummonerSpellRef } from "@/types";

const DATA_DRAGON_BASE = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "16.11.1";

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
    key: champion.key,
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
  return getLivePublicChampions(version);
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

export interface RiotItemPayload {
  type: string;
  version: string;
  basic: unknown;
  data: Record<
    string,
    {
      name: string;
      plaintext?: string;
      description?: string;
      tags?: string[];
      gold?: {
        total?: number;
        purchasable?: boolean;
      };
      from?: string[];
      into?: string[];
      maps?: Record<string, boolean>;
      image?: {
        full: string;
      };
    }
  >;
}

export interface RiotSummonerSpellPayload {
  type: string;
  version: string;
  data: Record<
    string,
    {
      id: string;
      key: string;
      name: string;
      image: {
        full: string;
      };
    }
  >;
}

export async function fetchRiotItemPayload(version?: string): Promise<RiotItemPayload> {
  const resolvedVersion = version ?? (await getLatestDataDragonVersion());
  const response = await fetch(`${DATA_DRAGON_BASE}/cdn/${resolvedVersion}/data/en_US/item.json`, {
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) {
    throw new Error(`Data Dragon item fetch failed with ${response.status}`);
  }

  return (await response.json()) as RiotItemPayload;
}

export async function fetchRiotSummonerSpellPayload(version?: string): Promise<RiotSummonerSpellPayload> {
  const resolvedVersion = version ?? (await getLatestDataDragonVersion());
  const response = await fetch(`${DATA_DRAGON_BASE}/cdn/${resolvedVersion}/data/en_US/summoner.json`, {
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) {
    throw new Error(`Data Dragon summoner spell fetch failed with ${response.status}`);
  }

  return (await response.json()) as RiotSummonerSpellPayload;
}

export async function getLivePublicChampions(version?: string): Promise<PublicChampion[]> {
  const resolvedVersion = version ?? (await getLatestDataDragonVersion());

  try {
    const payload = await fetchRiotChampionPayload(resolvedVersion);
    const supplemental = new Map(champions.map((champion) => [champion.id, champion]));

    return Object.values(payload.data)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((champion) => {
        const local = supplemental.get(champion.id);

        return {
          id: champion.id,
          key: Number(champion.key),
          name: champion.name,
          title: champion.title,
          roles: champion.tags.length > 0 ? champion.tags : (local?.roles ?? []),
          region: local?.region ?? "Runeterra",
          resource: champion.partype || local?.resource || "None",
          gender: local?.gender ?? "Unknown",
          releaseYear: local?.releaseYear ?? 0,
          squareUrl: championSquareUrl(resolvedVersion, champion.id),
          splashUrl: championSplashUrl(champion.id)
        };
      });
  } catch {
    return champions.map((champion) => toPublicChampion(champion, resolvedVersion));
  }
}

export async function getLiveSummonerSpells(version?: string): Promise<SummonerSpellRef[]> {
  const resolvedVersion = version ?? (await getLatestDataDragonVersion());
  const payload = await fetchRiotSummonerSpellPayload(resolvedVersion);

  return Object.values(payload.data)
    .map((spell) => ({
      id: Number(spell.key),
      key: spell.id,
      name: spell.name,
      iconUrl: `${DATA_DRAGON_BASE}/cdn/${resolvedVersion}/img/spell/${spell.image.full}`
    }))
    .filter((spell) => Number.isFinite(spell.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLiveGameItems(version?: string): Promise<GameItem[]> {
  const resolvedVersion = version ?? (await getLatestDataDragonVersion());

  try {
    const payload = await fetchRiotItemPayload(resolvedVersion);

    return Object.entries(payload.data)
      .filter(([, item]) => item.maps?.["11"] !== false)
      .map(([id, item]) => ({
        id,
        name: item.name,
        plaintext: stripHtml(item.plaintext || item.description || ""),
        tags: item.tags ?? [],
        goldTotal: item.gold?.total ?? 0,
        purchasable: item.gold?.purchasable ?? false,
        from: item.from ?? [],
        into: item.into ?? [],
        imageUrl: `${DATA_DRAGON_BASE}/cdn/${resolvedVersion}/img/item/${item.image?.full ?? `${id}.png`}`
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return items.map((item) => ({
      ...item,
      imageUrl: `${DATA_DRAGON_BASE}/cdn/${resolvedVersion}/img/item/${item.id}.png`
    }));
  }
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
