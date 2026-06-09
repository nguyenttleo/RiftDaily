import { NextResponse } from "next/server";

import { getNextUtcReset, getUtcDateKey, seededIndex } from "@/game/generators/daily";
import { readDailyPlayPayload, writeDailyPlayPayload } from "@/lib/daily-play-payload-cache";
import { env } from "@/lib/env";
import { getLatestDataDragonVersion } from "@/lib/riot/data-dragon";
import type {
  TftConnectionsCategory,
  TftConnectionsRound,
  TftDailyResponse,
  TftItemRef,
  TftRecipeRound,
  TftUnitRef
} from "@/types/tft";

export const runtime = "nodejs";

const DATA_DRAGON_BASE = "https://ddragon.leagueoflegends.com";
const COMMUNITY_DRAGON_TFT_URL = "https://raw.communitydragon.org/latest/cdragon/tft/en_us.json";
const TFT_DAILY_CACHE_MS = 1000 * 60 * 60;
const TFT_CONNECTIONS_ROUND_COUNT = 8;
const TFT_PLAY_PAYLOAD_CACHE_VERSION = "v5";
const TFT_COMPONENT_IDS = new Set([
  "TFT_Item_BFSword",
  "TFT_Item_RecurveBow",
  "TFT_Item_NeedlesslyLargeRod",
  "TFT_Item_TearOfTheGoddess",
  "TFT_Item_ChainVest",
  "TFT_Item_NegatronCloak",
  "TFT_Item_GiantsBelt",
  "TFT_Item_SparringGloves"
]);

interface DataDragonTftImage {
  full: string;
}

interface DataDragonTftItem {
  id: string;
  name: string;
  image: DataDragonTftImage;
}

interface DataDragonTftChampion {
  id: string;
  name: string;
  cost: number;
  image: DataDragonTftImage;
}

interface DataDragonTftPayload<T> {
  data: Record<string, T>;
}

interface CommunityDragonTftItem {
  apiName?: string;
  name?: string;
  composition?: string[];
}

interface CommunityDragonTftChampion {
  apiName?: string;
  name?: string;
  cost?: number;
  role?: string | null;
  traits?: string[];
}

interface CommunityDragonTftSet {
  champions?: CommunityDragonTftChampion[];
}

interface CommunityDragonTftPayload {
  items?: CommunityDragonTftItem[];
  sets?: Record<string, CommunityDragonTftSet>;
}

type ConnectionsCandidate = {
  id: string;
  label: string;
  kind: TftConnectionsCategory["kind"];
  units: TftUnitRef[];
};

let cachedTftDaily: {
  key: string;
  expiresAt: number;
  value: TftDailyResponse;
} | null = null;

export async function GET() {
  const body = await resolveTftDaily();
  const response = NextResponse.json(body);
  response.headers.set("Cache-Control", "public, max-age=60, s-maxage=3600, stale-while-revalidate=7200");
  response.headers.set("Vary", "Accept-Encoding");
  return response;
}

async function resolveTftDaily(): Promise<TftDailyResponse> {
  const date = getUtcDateKey();
  const cacheKey = tftPayloadCacheKey(date);

  if (cachedTftDaily?.key === cacheKey && cachedTftDaily.expiresAt > Date.now()) {
    return cachedTftDaily.value;
  }

  const persistedPayload = await readDailyPlayPayload<TftDailyResponse>(cacheKey);

  if (persistedPayload) {
    cachedTftDaily = {
      key: cacheKey,
      expiresAt: Date.now() + TFT_DAILY_CACHE_MS,
      value: persistedPayload
    };

    return persistedPayload;
  }

  const version = await getLatestDataDragonVersion();

  const [itemsPayload, championsPayload, communityPayload] = await Promise.all([
    fetchJson<DataDragonTftPayload<DataDragonTftItem>>(`${DATA_DRAGON_BASE}/cdn/${version}/data/en_US/tft-item.json`),
    fetchJson<DataDragonTftPayload<DataDragonTftChampion>>(`${DATA_DRAGON_BASE}/cdn/${version}/data/en_US/tft-champion.json`),
    fetchJson<CommunityDragonTftPayload>(COMMUNITY_DRAGON_TFT_URL, { cache: "no-store" })
  ]);
  const setNumber = currentSetNumber(communityPayload);
  const itemLookup = createTftItemLookup(itemsPayload, version);
  const units = createCurrentSetUnits(communityPayload, championsPayload, version, setNumber);
  const recipeRounds = createTftRecipeRounds(communityPayload.items ?? [], itemLookup, date);
  const connectionsRounds = createConnectionsRounds(units, date, setNumber);
  const value: TftDailyResponse = {
    product: "tft",
    date,
    resetAt: getNextUtcReset(),
    dataDragonVersion: version,
    setNumber,
    recipe: {
      type: "tft-recipe",
      rounds: recipeRounds
    },
    connections: {
      type: "tft-connections",
      rounds: connectionsRounds
    }
  };

  cachedTftDaily = {
    key: cacheKey,
    expiresAt: Date.now() + TFT_DAILY_CACHE_MS,
    value
  };
  await writeDailyPlayPayload({
    cacheKey,
    product: "tft",
    date,
    profile: `tft:recipes-two-components:connections-${TFT_CONNECTIONS_ROUND_COUNT}`,
    dataDragonVersion: version,
    payload: value,
    expiresAt: value.resetAt
  });

  return value;
}

function tftPayloadCacheKey(date: string) {
  return `${TFT_PLAY_PAYLOAD_CACHE_VERSION}:tft:${date}:recipes-two-components:connections-${TFT_CONNECTIONS_ROUND_COUNT}`;
}

async function fetchJson<T>(url: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
  const response = await fetch(url, init ?? { next: { revalidate: 60 * 60 * 12 } });

  if (!response.ok) {
    throw new Error(`TFT data fetch failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function createTftItemLookup(payload: DataDragonTftPayload<DataDragonTftItem>, version: string) {
  const byId = new Map<string, TftItemRef>();

  for (const item of Object.values(payload.data)) {
    if (!item.id || !item.name || !item.image?.full) {
      continue;
    }

    byId.set(item.id, {
      id: item.id,
      name: item.name,
      imageUrl: `${DATA_DRAGON_BASE}/cdn/${version}/img/tft-item/${item.image.full}`
    });
  }

  return byId;
}

function createTftRecipeRounds(items: CommunityDragonTftItem[], itemLookup: Map<string, TftItemRef>, date: string): TftRecipeRound[] {
  const componentOptions = [...TFT_COMPONENT_IDS]
    .map((id) => itemLookup.get(id))
    .filter((item): item is TftItemRef => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));
  const recipes = items
    .filter((item) => isCraftableCurrentPatchItem(item, itemLookup))
    .map((item) => {
      const resultItem = itemLookup.get(item.apiName ?? "");
      const components = (item.composition ?? [])
        .map((id) => itemLookup.get(id))
        .filter((component): component is TftItemRef => Boolean(component));

      return resultItem && components.length === 2 ? { resultItem, components } : null;
    })
    .filter((recipe): recipe is { resultItem: TftItemRef; components: TftItemRef[] } => Boolean(recipe));
  const uniqueRecipes = uniqueBy(recipes, (recipe) => recipe.resultItem.id);
  const selectedRecipes = seededShuffle(uniqueRecipes, `${env.challengeSalt}:${date}:tft-recipe`);

  return selectedRecipes.map((recipe, index) => {
    return {
      id: `${date}:tft-recipe:${index}:${recipe.resultItem.id}`,
      resultItem: recipe.resultItem,
      components: recipe.components,
      options: componentOptions
    };
  });
}

function isCraftableCurrentPatchItem(item: CommunityDragonTftItem, itemLookup: Map<string, TftItemRef>) {
  const apiName = item.apiName ?? "";
  const composition = item.composition ?? [];

  return (
    apiName.startsWith("TFT_Item_") &&
    !apiName.includes("Corrupted") &&
    Boolean(item.name) &&
    itemLookup.has(apiName) &&
    composition.length === 2 &&
    composition.every((componentId) => TFT_COMPONENT_IDS.has(componentId) && itemLookup.has(componentId))
  );
}

function currentSetNumber(payload: CommunityDragonTftPayload) {
  const setNumbers = Object.keys(payload.sets ?? {})
    .filter((key) => /^\d+$/.test(key))
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  return setNumbers[setNumbers.length - 1] ?? 0;
}

function createCurrentSetUnits(
  communityPayload: CommunityDragonTftPayload,
  championsPayload: DataDragonTftPayload<DataDragonTftChampion>,
  version: string,
  setNumber: number
) {
  const currentSet = communityPayload.sets?.[String(setNumber)];
  const currentPrefix = `TFT${setNumber}_`;
  const championImages = new Map(
    Object.values(championsPayload.data)
      .filter((champion) => champion.id.startsWith(currentPrefix) && champion.image?.full)
      .map((champion) => [
        champion.id,
        `${DATA_DRAGON_BASE}/cdn/${version}/img/tft-champion/${champion.image.full}`
      ])
  );
  const units = (currentSet?.champions ?? [])
    .map((champion): TftUnitRef | null => {
      const id = champion.apiName ?? "";
      const name = formatTftUnitName(champion.name);
      const traits = (champion.traits ?? []).filter((trait) => trait && trait !== "Choose Trait");
      const cost = Number(champion.cost ?? 0);
      const imageUrl = championImages.get(id);

      if (!id.startsWith(currentPrefix) || cost < 1 || cost > 5 || traits.length === 0 || !imageUrl || !name) {
        return null;
      }

      return {
        id,
        name,
        cost,
        role: formatUnitRole(champion.role),
        traits,
        imageUrl
      };
    })
    .filter((unit): unit is TftUnitRef => Boolean(unit));

  return uniqueBy(units, (unit) => unit.id).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
}

function createConnectionsRounds(units: TftUnitRef[], date: string, setNumber: number): TftConnectionsRound[] {
  const candidates = createConnectionsCandidates(units);

  return Array.from({ length: TFT_CONNECTIONS_ROUND_COUNT }, (_, index) =>
    createConnectionsRound(units, candidates, `${env.challengeSalt}:${date}:tft-connections:${setNumber}:${index}`, `${date}:tft-connections:${index}`)
  );
}

function createConnectionsCandidates(units: TftUnitRef[]): ConnectionsCandidate[] {
  const candidates: ConnectionsCandidate[] = [];

  for (const [trait, traitUnits] of groupedBy(units, (unit) => unit.traits).entries()) {
    if (traitUnits.length >= 4) {
      candidates.push({
        id: `trait:${trait}`,
        label: trait,
        kind: "synergy",
        units: traitUnits
      });
    }
  }

  for (const [role, roleUnits] of groupedBy(units, (unit) => [unit.role]).entries()) {
    if (role !== "Flex" && roleUnits.length >= 4) {
      candidates.push({
        id: `role:${role}`,
        label: role,
        kind: "unit type",
        units: roleUnits
      });
    }
  }

  for (const [cost, costUnits] of groupedBy(units, (unit) => [`${unit.cost}-cost`]).entries()) {
    if (costUnits.length >= 4) {
      candidates.push({
        id: `cost:${cost}`,
        label: `${costUnits[0].cost}-cost units`,
        kind: "cost",
        units: costUnits
      });
    }
  }

  return candidates;
}

function createConnectionsRound(units: TftUnitRef[], candidates: ConnectionsCandidate[], seed: string, id: string): TftConnectionsRound {
  const selectedCategories: TftConnectionsCategory[] = [];
  const selectedUnits = new Map<string, TftUnitRef>();

  for (const candidate of seededShuffle(candidates, seed)) {
    const availableUnits = candidate.units.filter((unit) => !selectedUnits.has(unit.id));

    if (availableUnits.length < 4) {
      continue;
    }

    const chosenUnits = seededShuffle(availableUnits, `${seed}:${candidate.id}`).slice(0, 4);

    for (const unit of chosenUnits) {
      selectedUnits.set(unit.id, unit);
    }

    selectedCategories.push({
      id: candidate.id,
      label: candidate.label,
      kind: candidate.kind,
      unitIds: chosenUnits.map((unit) => unit.id)
    });

    if (selectedCategories.length === 4) {
      break;
    }
  }

  if (selectedCategories.length < 4) {
    return createFallbackConnectionsRound(units, seed, id);
  }

  return {
    id,
    categories: selectedCategories,
    units: seededShuffle([...selectedUnits.values()], `${seed}:units`)
  };
}

function createFallbackConnectionsRound(units: TftUnitRef[], seed: string, id: string): TftConnectionsRound {
  const selectedCategories: TftConnectionsCategory[] = [];
  const selectedUnits = new Map<string, TftUnitRef>();

  for (const [cost, costUnits] of groupedBy(units, (unit) => [`${unit.cost}`]).entries()) {
    const availableUnits = costUnits.filter((unit) => !selectedUnits.has(unit.id));

    if (availableUnits.length < 4) {
      continue;
    }

    const chosenUnits = seededShuffle(availableUnits, `${seed}:fallback:${cost}`).slice(0, 4);

    for (const unit of chosenUnits) {
      selectedUnits.set(unit.id, unit);
    }

    selectedCategories.push({
      id: `fallback-cost:${cost}`,
      label: `${cost}-cost units`,
      kind: "cost",
      unitIds: chosenUnits.map((unit) => unit.id)
    });

    if (selectedCategories.length === 4) {
      break;
    }
  }

  return {
    id,
    categories: selectedCategories,
    units: seededShuffle([...selectedUnits.values()], `${seed}:fallback-units`)
  };
}

function groupedBy<T>(values: T[], keysForValue: (value: T) => string[]) {
  const groups = new Map<string, T[]>();

  for (const value of values) {
    for (const key of keysForValue(value)) {
      const group = groups.get(key) ?? [];
      group.push(value);
      groups.set(key, group);
    }
  }

  return groups;
}

function uniqueBy<T>(values: T[], keyForValue: (value: T) => string) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const value of values) {
    const key = keyForValue(value);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(value);
  }

  return unique;
}

function seededShuffle<T>(values: T[], seed: string) {
  return [...values].sort((a, b) => {
    const left = seededIndex(`${seed}:${JSON.stringify(a)}`, 100000);
    const right = seededIndex(`${seed}:${JSON.stringify(b)}`, 100000);
    return left - right;
  });
}

function formatTftUnitName(name?: string) {
  return name?.trim() ?? "";
}

function formatUnitRole(role?: string | null) {
  if (!role) {
    return "Flex";
  }

  return role
    .replace(/^AD/, "AD ")
    .replace(/^AP/, "AP ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}
