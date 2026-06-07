import type {
  BuildWinrateStats,
  ChampionMatchupChallenge,
  ChampionMatchupRound,
  DodgeQueueChallenge,
  DodgeQueueRound,
  ExpandedDailyChallenges,
  GameItem,
  GuessEloChallenge,
  GuessEloRound,
  ItemBuildChallenge,
  ItemRecipeChallenge,
  PublicChampion,
  SkillshotDodgeChallenge
} from "@/types";

import { getUtcDateKey, seededIndex } from "./daily";

const MIN_BUILD_WINRATE_GAMES = 5;

type VerifiedBuildTarget = {
  answerBuild: GameItem[];
  answerBoots: GameItem;
  enemyChampionIds: string[];
  possibleItems: GameItem[];
  possibleBoots: GameItem[];
  stats: BuildWinrateStats;
};

export async function generateExpandedDailyChallenges(
  version: string,
  salt: string,
  publicChampions: PublicChampion[],
  gameItems: GameItem[],
  verifiedMatches?: {
    guessEloRounds: GuessEloRound[];
    dodgeQueueRounds: DodgeQueueRound[];
    championMatchupRounds?: ChampionMatchupRound[];
    championWinrateSamples?: Record<string, BuildWinrateStats>;
    status?: "ready" | "unconfigured" | "unavailable";
    message?: string;
    guessEloMessage?: string;
    dodgeQueueMessage?: string;
    championMatchupMessage?: string;
  },
  date = new Date()
): Promise<ExpandedDailyChallenges> {
  const dateKey = getUtcDateKey(date);

  return {
    itemBuild: generateItemBuildChallenge(
      dateKey,
      `${salt}:${dateKey}:item-build`,
      publicChampions,
      gameItems,
      version,
      verifiedMatches?.championWinrateSamples ?? {}
    ),
    itemRecipe: generateItemRecipeChallenge(dateKey, `${salt}:${dateKey}:item-recipe`, gameItems),
    guessElo: generateGuessEloChallenge(dateKey, verifiedMatches?.guessEloRounds ?? [], verifiedMatches?.guessEloMessage ?? verifiedMatches?.message),
    dodgeQueue: generateDodgeQueueChallenge(dateKey, verifiedMatches?.dodgeQueueRounds ?? [], verifiedMatches?.dodgeQueueMessage ?? verifiedMatches?.message),
    championMatchup: generateChampionMatchupChallenge(
      dateKey,
      verifiedMatches?.championMatchupRounds ?? [],
      verifiedMatches?.championMatchupMessage ?? (verifiedMatches?.status === "unconfigured" ? verifiedMatches.message : undefined)
    ),
    skillshotDodge: generateSkillshotDodgeChallenge(dateKey)
  };
}

function generateItemBuildChallenge(
  date: string,
  seed: string,
  publicChampions: PublicChampion[],
  itemCatalog: GameItem[],
  version: string,
  winrateSamples: Record<string, BuildWinrateStats>
): ItemBuildChallenge {
  const playable = publicChampions
    .map((champion) => ({
      champion,
      target: selectVerifiedBuildTarget(winrateSamples[champion.id], itemCatalog)
    }))
    .filter((entry): entry is { champion: PublicChampion; target: VerifiedBuildTarget } => Boolean(entry.target))
    .sort(
      (a, b) =>
        (b.target.stats.buildGames ?? 0) - (a.target.stats.buildGames ?? 0) ||
        b.target.stats.buildWinRate! - a.target.stats.buildWinRate! ||
        a.champion.name.localeCompare(b.champion.name)
    );

  if (playable.length === 0) {
    return unavailableItemBuildChallenge(
      date,
      winrateSamples,
      `Build needs ${MIN_BUILD_WINRATE_GAMES}+ Riot Match-V5 games with the same completed five-item plus boots inventory and a real enemy team. Keep warming the live cache.`
    );
  }

  const selected = playable[seededIndex(seed, playable.length)];
  const champion = selected.champion;
  const enemyTeam = selected.target.enemyChampionIds
    .map((championId) => publicChampions.find((candidate) => candidate.id === championId))
    .filter(Boolean) as PublicChampion[];
  const answerBuild = selected.target.answerBuild;
  const answer = answerBuild[0];
  const answerBoots = selected.target.answerBoots;
  const possibleItems = selected.target.possibleItems;
  const possibleBoots = selected.target.possibleBoots;
  const candidates = answerBuild
    .slice(0, 4)
    .sort((a, b) => seededIndex(`${seed}:${a.id}`, 1000) - seededIndex(`${seed}:${b.id}`, 1000));

  return {
    id: `${date}:item-build`,
    type: "item-build",
    date,
    champion,
    enemyTeam,
    candidates,
    possibleItems,
    possibleBoots,
    answerItemId: answer.id,
    answerItemIds: answerBuild.map((item) => item.id),
    answerBootsId: answerBoots.id,
    matchupNotes: buildMatchupNotes(champion, enemyTeam, answerBuild, answerBoots),
    winrateStats: selected.target.stats,
    winrateSamples,
    catalogModel: {
      source: `Riot Match-V5 current-patch inventory samples + Riot Data Dragon ${version}`,
      candidateCount: possibleItems.length,
      targetItemCount: answerBuild.length
    }
  };
}

function buildTargetFromInventory(itemIds: string[], itemById: Map<string, GameItem>) {
  const items = uniqueStrings(itemIds)
    .map((itemId) => itemById.get(itemId))
    .filter(Boolean) as GameItem[];
  const answerBoots = items.filter(isBootUpgrade).sort((a, b) => b.goldTotal - a.goldTotal || a.name.localeCompare(b.name))[0];

  if (!answerBoots) {
    return undefined;
  }

  const answerBuild = uniqueItemsByName(items.filter(isBuildCandidateItem)).slice(0, 5);

  if (answerBuild.length !== 5) {
    return undefined;
  }

  return {
    answerBuild,
    answerBoots
  };
}

function buildGroupKey(answerBuild: GameItem[], answerBoots: GameItem) {
  return `${answerBuild.map((item) => item.id).sort().join("+")}:${answerBoots.id}`;
}

function incrementObservedItem(target: Map<string, { item: GameItem; games: number; wins: number }>, item: GameItem, win: boolean) {
  const current = target.get(item.id) ?? { item, games: 0, wins: 0 };
  current.games += 1;
  current.wins += win ? 1 : 0;
  target.set(item.id, current);
}

function rankedObservedItems(target: Map<string, { item: GameItem; games: number; wins: number }>) {
  return uniqueItemsByName(
    [...target.values()]
      .sort((a, b) => b.games - a.games || b.wins - a.wins || a.item.name.localeCompare(b.item.name))
      .map((entry) => entry.item)
  );
}

function includeRequiredItems(items: GameItem[], required: GameItem[]) {
  return uniqueItemsByName([...required, ...items]);
}

function uniqueItemsByName(items: GameItem[]) {
  const seen = new Set<string>();
  const uniqueItems: GameItem[] = [];

  for (const item of items) {
    const key = itemNameKey(item);

    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(item);
    }
  }

  return uniqueItems;
}

function unavailableItemBuildChallenge(date: string, winrateSamples: Record<string, BuildWinrateStats>, reason: string): ItemBuildChallenge {
  const emptyChampion: PublicChampion = {
    id: "",
    name: "",
    title: "",
    roles: [],
    region: "",
    resource: "",
    gender: "",
    releaseYear: 0,
    squareUrl: "",
    splashUrl: ""
  };

  return {
    id: `${date}:item-build-unavailable`,
    type: "item-build",
    date,
    champion: emptyChampion,
    enemyTeam: [],
    candidates: [],
    possibleItems: [],
    possibleBoots: [],
    answerItemId: "",
    answerItemIds: [],
    answerBootsId: "",
    matchupNotes: [],
    winrateSamples,
    unavailableReason: reason,
    catalogModel: {
      source: "Riot Match-V5",
      candidateCount: 0,
      targetItemCount: 0
    }
  };
}

function selectVerifiedBuildTarget(stats: BuildWinrateStats | undefined, itemCatalog: GameItem[]): VerifiedBuildTarget | undefined {
  if (!stats || stats.games < MIN_BUILD_WINRATE_GAMES || !stats.inventorySamples?.length) {
    return undefined;
  }

  const itemById = new Map(itemCatalog.map((item) => [item.id, item]));
  const itemCounts = new Map<string, { item: GameItem; games: number; wins: number }>();
  const bootCounts = new Map<string, { item: GameItem; games: number; wins: number }>();
  const buildGroups = new Map<
    string,
    {
      answerBuild: GameItem[];
      answerBoots: GameItem;
      wins: number;
      games: number;
      matchIds: Set<string>;
      enemyChampionIds: string[];
    }
  >();

  for (const sample of stats.inventorySamples) {
    for (const itemId of uniqueStrings(sample.itemIds)) {
      const item = itemById.get(itemId);

      if (!item) {
        continue;
      }

      if (isBuildCandidateItem(item)) {
        incrementObservedItem(itemCounts, item, sample.win);
      } else if (isBootUpgrade(item)) {
        incrementObservedItem(bootCounts, item, sample.win);
      }
    }

    if ((sample.enemyChampionIds?.length ?? 0) < 5) {
      continue;
    }

    const sampledBuild = buildTargetFromInventory(sample.itemIds, itemById);

    if (!sampledBuild) {
      continue;
    }

    const key = buildGroupKey(sampledBuild.answerBuild, sampledBuild.answerBoots);
    const current = buildGroups.get(key) ?? {
      ...sampledBuild,
      wins: 0,
      games: 0,
      matchIds: new Set<string>(),
      enemyChampionIds: sample.enemyChampionIds!.slice(0, 5)
    };

    current.games += 1;
    current.wins += sample.win ? 1 : 0;
    current.matchIds.add(sample.matchId);

    if (current.enemyChampionIds.length < 5 && sample.enemyChampionIds) {
      current.enemyChampionIds = sample.enemyChampionIds.slice(0, 5);
    }

    buildGroups.set(key, current);
  }

  const selected = [...buildGroups.values()]
    .map((group) => ({
      ...group,
      winRate: Math.round((group.wins / group.games) * 1000) / 10
    }))
    .filter((group) => group.games >= MIN_BUILD_WINRATE_GAMES && group.enemyChampionIds.length >= 5 && group.winRate >= stats.winRate)
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games || a.answerBuild[0].name.localeCompare(b.answerBuild[0].name))[0];

  if (!selected) {
    return undefined;
  }

  const possibleItems = includeRequiredItems(rankedObservedItems(itemCounts), selected.answerBuild).slice(0, 36);
  const possibleBoots = includeRequiredItems(rankedObservedItems(bootCounts), [selected.answerBoots]);

  if (possibleItems.length < 5 || possibleBoots.length === 0) {
    return undefined;
  }

  const targetItemIds = [...selected.answerBuild.map((item) => item.id), selected.answerBoots.id];

  return {
    answerBuild: selected.answerBuild,
    answerBoots: selected.answerBoots,
    enemyChampionIds: selected.enemyChampionIds,
    possibleItems,
    possibleBoots,
    stats: {
      ...stats,
      targetItemIds,
      buildWins: selected.wins,
      buildGames: selected.games,
      buildWinRate: selected.winRate,
      buildSampleMatches: selected.matchIds.size,
      buildMatchedItemCount: targetItemIds.length
    }
  };
}

function itemNameKey(item: GameItem) {
  return item.name.trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isBuildCandidateItem(item: GameItem) {
  return item.purchasable && item.goldTotal >= 2200 && item.tags.length > 0 && !item.tags.includes("Consumable") && !item.tags.includes("Trinket") && !item.tags.includes("Boots");
}

function generateItemRecipeChallenge(date: string, seed: string, itemCatalog: GameItem[]): ItemRecipeChallenge {
  const craftable = itemCatalog.filter((item) =>
    item.from.length >= 2 &&
    item.from.every((id) => {
      const component = getItemById(itemCatalog, id);
      return component && isRecipeComponent(component, itemCatalog);
    })
  );
  const resultItem = craftable[seededIndex(seed, craftable.length)];
  const componentIds = resultItem.from;
  const missingComponentId = componentIds[seededIndex(`${seed}:missing`, componentIds.length)];
  const knownComponents = componentIds.filter((id) => id !== missingComponentId).map((id) => getItemById(itemCatalog, id)).filter(Boolean) as GameItem[];
  const missing = getItemById(itemCatalog, missingComponentId) ?? knownComponents[0];
  const distractors = itemCatalog
    .filter((item) => item.id !== missing.id && item.goldTotal <= Math.max(missing.goldTotal + 500, 900))
    .slice(0, 80)
    .sort((a, b) => seededIndex(`${seed}:${a.id}`, 1000) - seededIndex(`${seed}:${b.id}`, 1000))
    .slice(0, 5);
  const allComponents = getRecipeComponents(itemCatalog, [missing.id]);

  return {
    id: `${date}:item-recipe`,
    type: "item-recipe",
    date,
    resultItem,
    knownComponents,
    missingComponentId: missing.id,
    options: [missing, ...distractors].sort((a, b) => a.name.localeCompare(b.name)),
    allComponents
  };
}

function generateGuessEloChallenge(date: string, rounds: GuessEloRound[], unavailableReason?: string): GuessEloChallenge {
  const fallback: GuessEloRound = {
    id: `${date}:guess-elo-unavailable`,
    date,
    lanes: [],
    enemyLanes: [],
    options: ["Iron/Bronze", "Silver/Gold", "Platinum/Emerald", "Diamond/Master", "Grandmaster/Challenger"],
    answerTier: "",
    signalNotes: [],
    dataSource: "Riot Match-V5",
    unavailableReason: unavailableReason ?? "Riot Match-V5 ranked data is not configured."
  };
  const first = rounds[0] ?? fallback;

  return {
    ...first,
    type: "guess-elo",
    rounds
  };
}

function generateDodgeQueueChallenge(date: string, rounds: DodgeQueueRound[], unavailableReason?: string): DodgeQueueChallenge {
  const fallback: DodgeQueueRound = {
    id: `${date}:dodge-queue-unavailable`,
    date,
    allyTeam: [],
    enemyTeam: [],
    allySpells: [],
    enemySpells: [],
    allyBans: [],
    enemyBans: [],
    answer: "queue",
    explanation: "",
    unavailableReason: unavailableReason ?? "Riot Match-V5 ranked data is not configured."
  };
  const first = rounds[0] ?? fallback;

  return {
    ...first,
    type: "dodge-queue",
    rounds
  };
}

function generateChampionMatchupChallenge(date: string, rounds: ChampionMatchupRound[], unavailableReason?: string): ChampionMatchupChallenge {
  const fallback: ChampionMatchupRound = {
    id: `${date}:champion-matchup-unavailable`,
    date,
    left: emptyMatchupPick(),
    right: emptyMatchupPick(),
    answerSide: "left",
    dataSource: "Riot Match-V5",
    unavailableReason:
      unavailableReason ?? "Champion Matchup needs verified Riot Match-V5 ranked games where both selected champion-lane picks appear on opposite teams in the same match."
  };
  const first = rounds[0] ?? fallback;

  return {
    ...first,
    type: "champion-matchup",
    rounds
  };
}

function emptyMatchupPick() {
  const champion: PublicChampion = {
    id: "",
    name: "Unknown",
    title: "",
    roles: [],
    region: "",
    resource: "",
    gender: "",
    releaseYear: 0,
    squareUrl: "",
    splashUrl: ""
  };

  return {
    champion,
    role: "Lane",
    wins: 0,
    games: 0,
    winRate: 0,
    sampleMatches: 0
  };
}

function generateSkillshotDodgeChallenge(date: string): SkillshotDodgeChallenge {
  return {
    id: `${date}:skillshot-dodge`,
    type: "skillshot-dodge",
    date,
    title: "Kennen Skillshot Gauntlet",
    difficulty: "Gold",
    durationSeconds: 30,
    arena: { width: 900, height: 520 },
    player: { moveSpeed: 280, radius: 14, health: 3 }
  };
}

function isBootUpgrade(item: GameItem) {
  return item.purchasable && item.name !== "Boots" && item.tags.includes("Boots") && item.goldTotal >= 900;
}

function getItemById(itemCatalog: GameItem[], id: string) {
  return itemCatalog.find((item) => item.id === id);
}

function getRecipeComponents(itemCatalog: GameItem[], includeIds: string[] = []) {
  const include = new Set(includeIds);
  const candidates = itemCatalog
    .filter((item) => isRecipeComponent(item, itemCatalog) || include.has(item.id))
    .sort((a, b) => a.goldTotal - b.goldTotal || a.name.localeCompare(b.name));
  const chosen: GameItem[] = [];

  for (const item of candidates) {
    const existingIndex = chosen.findIndex((candidate) => candidate.name.toLowerCase() === item.name.toLowerCase());

    if (existingIndex === -1) {
      chosen.push(item);
    } else if (include.has(item.id) && !include.has(chosen[existingIndex].id)) {
      chosen[existingIndex] = item;
    }
  }

  return chosen;
}

function isRecipeComponent(item: GameItem, itemCatalog: GameItem[]) {
  const usedByPurchasableItem = itemCatalog.some((parent) => parent.purchasable && parent.from.includes(item.id));

  return (
    usedByPurchasableItem &&
    item.purchasable &&
    item.goldTotal > 0 &&
    item.goldTotal <= 1800 &&
    !item.tags.includes("Consumable") &&
    !item.tags.includes("Trinket") &&
    (item.name === "Boots" || !item.tags.includes("Boots"))
  );
}

function buildMatchupNotes(champion: PublicChampion, enemyTeam: PublicChampion[], answerBuild: GameItem[], answerBoots: GameItem): string[] {
  const tanks = enemyTeam.filter((enemy) => enemy.roles.includes("Tank")).length;
  const assassins = enemyTeam.filter((enemy) => enemy.roles.includes("Assassin")).length;

  return [
    `Target build: ${answerBuild.map((item) => item.name).join(", ")} plus ${answerBoots.name}.`,
    `Enemy pressure: ${tanks} tank-class champion${tanks === 1 ? "" : "s"} and ${assassins} assassin-class champion${assassins === 1 ? "" : "s"}.`
  ];
}
