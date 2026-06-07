import { champions, items } from "@/game/data/champions";
import type { Champion, GameItem, PublicChampion, SummonerSpellRef } from "@/types";

const DATA_DRAGON_BASE = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "16.11.1";
const SUMMONERS_RIFT_MAP_ID = "11";
const NON_SUMMONERS_RIFT_FALLBACK_ITEM_IDS = new Set([
  "1035",
  "1039",
  "1040",
  "1090",
  "1091",
  "1092",
  "1093",
  "1094",
  "1104",
  "1111",
  "1200",
  "1201",
  "1202",
  "1203",
  "1204",
  "1205",
  "1206",
  "1207",
  "1208",
  "1209",
  "1210",
  "1211",
  "1220",
  "1221",
  "1222",
  "1504",
  "2002",
  "2008",
  "2015",
  "2049",
  "2050",
  "2051",
  "2056",
  "2142",
  "2143",
  "2144",
  "2145",
  "2146",
  "2147",
  "2161",
  "2162",
  "2163",
  "3001",
  "3005",
  "3012",
  "3023",
  "3039",
  "3095",
  "3105",
  "3112",
  "3128",
  "3131",
  "3177",
  "3184",
  "3193",
  "3348",
  "3349",
  "3398",
  "3399",
  "3430",
  "3513",
  "3850",
  "3851",
  "3853",
  "3854",
  "3855",
  "3857",
  "3858",
  "3859",
  "3860",
  "3862",
  "3863",
  "3864",
  "4003",
  "4004",
  "4010",
  "4011",
  "4012",
  "4013",
  "4014",
  "4015",
  "4016",
  "4017",
  "4402",
  "4403",
  "4638",
  "4643",
  "4644",
  "6029",
  "6032",
  "6035",
  "6630",
  "6632",
  "6656",
  "6667",
  "6671",
  "6677",
  "6691",
  "6700",
  "6702",
  "9168",
  "9171",
  "9172",
  "9173",
  "9174",
  "9175",
  "9176",
  "9177",
  "9178",
  "9179",
  "9180",
  "9181",
  "9183",
  "9184",
  "9185",
  "9187",
  "9188",
  "9189",
  "9190",
  "9192",
  "9193",
  "9271",
  "9272",
  "9273",
  "9274",
  "9275",
  "9276",
  "9277",
  "9278",
  "9279",
  "9280",
  "9281",
  "9283",
  "9284",
  "9285",
  "9287",
  "9288",
  "9289",
  "9290",
  "9292",
  "9293",
  "9300",
  "9301",
  "9302",
  "9303",
  "9304",
  "9305",
  "9306",
  "9307",
  "9308",
  "9400",
  "9401",
  "9402",
  "9403",
  "9404",
  "9405",
  "9406",
  "9407",
  "9408"
]);

let cachedVersion: string | null = null;
const liveChampionCache = new Map<string, PublicChampion[]>();
const liveItemCache = new Map<string, GameItem[]>();
const liveSummonerSpellCache = new Map<string, SummonerSpellRef[]>();

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
      inStore?: boolean;
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
  const cached = liveChampionCache.get(resolvedVersion);

  if (cached) {
    return cached;
  }

  try {
    const payload = await fetchRiotChampionPayload(resolvedVersion);
    const supplemental = new Map(champions.map((champion) => [champion.id, champion]));

    const liveChampions = Object.values(payload.data)
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

    liveChampionCache.set(resolvedVersion, liveChampions);
    return liveChampions;
  } catch {
    const fallbackChampions = champions.map((champion) => toPublicChampion(champion, resolvedVersion));
    liveChampionCache.set(resolvedVersion, fallbackChampions);
    return fallbackChampions;
  }
}

export async function getLiveSummonerSpells(version?: string): Promise<SummonerSpellRef[]> {
  const resolvedVersion = version ?? (await getLatestDataDragonVersion());
  const cached = liveSummonerSpellCache.get(resolvedVersion);

  if (cached) {
    return cached;
  }

  const payload = await fetchRiotSummonerSpellPayload(resolvedVersion);

  const spells = Object.values(payload.data)
    .map((spell) => ({
      id: Number(spell.key),
      key: spell.id,
      name: spell.name,
      iconUrl: `${DATA_DRAGON_BASE}/cdn/${resolvedVersion}/img/spell/${spell.image.full}`
    }))
    .filter((spell) => Number.isFinite(spell.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  liveSummonerSpellCache.set(resolvedVersion, spells);
  return spells;
}

export async function getLiveGameItems(version?: string): Promise<GameItem[]> {
  const resolvedVersion = version ?? (await getLatestDataDragonVersion());
  const cached = liveItemCache.get(resolvedVersion);

  if (cached) {
    return cached;
  }

  try {
    const payload = await fetchRiotItemPayload(resolvedVersion);

    const liveItems = Object.entries(payload.data)
      .filter(([id, item]) => isSummonersRiftRiotItem(id, item))
      .map(([id, item]) => ({
        id,
        name: item.name,
        plaintext: stripHtml(item.plaintext || item.description || ""),
        tags: item.tags ?? [],
        goldTotal: item.gold?.total ?? 0,
        purchasable: item.gold?.purchasable ?? false,
        from: item.from ?? [],
        into: item.into ?? [],
        maps: item.maps,
        imageUrl: `${DATA_DRAGON_BASE}/cdn/${resolvedVersion}/img/item/${item.image?.full ?? `${id}.png`}`
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    liveItemCache.set(resolvedVersion, liveItems);
    return liveItems;
  } catch {
    const fallbackItems = items
      .filter(isSummonersRiftFallbackItem)
      .map((item) => ({
        ...item,
        imageUrl: `${DATA_DRAGON_BASE}/cdn/${resolvedVersion}/img/item/${item.id}.png`
      }));

    liveItemCache.set(resolvedVersion, fallbackItems);
    return fallbackItems;
  }
}

function isSummonersRiftRiotItem(id: string, item: RiotItemPayload["data"][string]) {
  return id.length <= 4 && item.maps?.[SUMMONERS_RIFT_MAP_ID] === true && item.inStore !== false && !NON_SUMMONERS_RIFT_FALLBACK_ITEM_IDS.has(id);
}

function isSummonersRiftFallbackItem(item: GameItem) {
  return item.id.length <= 4 && !NON_SUMMONERS_RIFT_FALLBACK_ITEM_IDS.has(item.id);
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
