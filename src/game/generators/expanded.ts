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
const POSITIVE_BUILD_ITEM_BOOST = 1200;

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
  const buildCandidateIds = buildCandidateItemIds(itemCatalog);
  const sampledChampions = publicChampions
    .filter((champion) => hasPositiveBuildItemSample(winrateSamples[champion.id], buildCandidateIds))
    .sort((a, b) => (winrateSamples[b.id]?.games ?? 0) - (winrateSamples[a.id]?.games ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 20);
  const championPool = sampledChampions.length > 0 ? sampledChampions : publicChampions;
  const champion = championPool[seededIndex(seed, championPool.length)];
  const enemyTeam = pickUnique(publicChampions, `${seed}:enemy`, 5, [champion.id]);
  const sampleItemFrequency = buildItemFrequency(winrateSamples[champion.id]);
  const positiveItemSamples = buildPositiveItemSamples(winrateSamples[champion.id]);
  const candidateItems = itemCatalog
    .filter(isBuildCandidateItem)
    .map((item) => ({
      item,
      score: scoreItemForMatchup(item, champion, enemyTeam) + sampleItemScore(item.id, sampleItemFrequency, positiveItemSamples)
    }))
    .sort((a, b) => b.score - a.score);
  const uniqueCandidateItems = uniqueScoredItemsByName(candidateItems);
  const bootCandidates = itemCatalog
    .filter((item) => isBootUpgrade(item))
    .map((item) => ({
      item,
      score: scoreBootsForMatchup(item, champion, enemyTeam) + sampleItemScore(item.id, sampleItemFrequency, positiveItemSamples)
    }))
    .sort((a, b) => b.score - a.score);
  const uniqueBootCandidates = uniqueScoredItemsByName(bootCandidates);
  const answerBuild = uniqueCandidateItems.slice(0, 5).map((candidate) => candidate.item);
  const answer = answerBuild[0];
  const answerBoots = uniqueBootCandidates[0]?.item ?? itemCatalog.find((item) => item.tags.includes("Boots") && item.name !== "Boots") ?? answer;
  const targetItemIds = [...answerBuild.map((item) => item.id), answerBoots.id];
  const possibleItems = uniqueCandidateItems
    .filter((candidate) => candidate.score >= 6)
    .slice(0, 32)
    .map((candidate) => candidate.item);
  const possibleBoots = uniqueBootCandidates.map((candidate) => candidate.item);
  const candidates = [answer, ...uniqueCandidateItems.slice(1).filter((candidate) => candidate.item.id !== answer.id).slice(0, 3).map((candidate) => candidate.item)]
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
    winrateStats: withTargetBuildWinrate(winrateSamples[champion.id], targetItemIds),
    winrateSamples,
    catalogModel: {
      source: `Riot Data Dragon ${version} champion/item metadata`,
      candidateCount: possibleItems.length,
      targetItemCount: answerBuild.length
    }
  };
}

function buildItemFrequency(stats: BuildWinrateStats | undefined) {
  const frequency = new Map<string, number>();

  for (const game of stats?.inventorySamples ?? []) {
    for (const itemId of game.itemIds) {
      frequency.set(itemId, (frequency.get(itemId) ?? 0) + 1);
    }
  }

  return frequency;
}

function withTargetBuildWinrate(stats: BuildWinrateStats | undefined, targetItemIds: string[]) {
  if (!stats) {
    return undefined;
  }

  const samples = stats.inventorySamples ?? [];
  const targetIds = uniqueStrings(targetItemIds);
  let selected: {
    games: typeof samples;
    wins: number;
    winRate: number;
    matchedItemCount: number;
  } | undefined;

  for (let size = targetIds.length; size >= 1; size -= 1) {
    let bestAtSize: typeof selected;

    for (const subset of combinations(targetIds, size)) {
      const games = samples.filter((game) => subset.every((itemId) => game.itemIds.includes(itemId)));

      if (games.length < MIN_BUILD_WINRATE_GAMES) {
        continue;
      }

      const wins = games.filter((game) => game.win).length;
      const winRate = Math.round((wins / games.length) * 1000) / 10;

      if (winRate < stats.winRate) {
        continue;
      }

      if (
        !bestAtSize ||
        winRate - stats.winRate > bestAtSize.winRate - stats.winRate ||
        (winRate === bestAtSize.winRate && games.length > bestAtSize.games.length)
      ) {
        bestAtSize = {
          games,
          wins,
          winRate,
          matchedItemCount: size
        };
      }
    }

    if (bestAtSize) {
      selected = bestAtSize;
      break;
    }
  }

  return {
    ...stats,
    targetItemIds,
    buildWins: selected?.wins,
    buildGames: selected?.games.length,
    buildWinRate: selected?.winRate,
    buildSampleMatches: selected ? new Set(selected.games.map((game) => game.matchId)).size : undefined,
    buildMatchedItemCount: selected?.matchedItemCount
  };
}

function buildCandidateItemIds(itemCatalog: GameItem[]) {
  return new Set(itemCatalog.filter((item) => isBuildCandidateItem(item) || isBootUpgrade(item)).map((item) => item.id));
}

function hasPositiveBuildItemSample(stats: BuildWinrateStats | undefined, candidateItemIds: Set<string>) {
  if (!stats || stats.games < MIN_BUILD_WINRATE_GAMES) {
    return false;
  }

  for (const [itemId] of buildPositiveItemSamples(stats)) {
    if (candidateItemIds.has(itemId)) {
      return true;
    }
  }

  return false;
}

function buildPositiveItemSamples(stats: BuildWinrateStats | undefined) {
  const samples = new Map<string, { wins: number; games: number; winRate: number; lift: number }>();

  if (!stats || stats.games < MIN_BUILD_WINRATE_GAMES) {
    return samples;
  }

  const raw = new Map<string, { wins: number; games: number }>();

  for (const game of stats.inventorySamples ?? []) {
    for (const itemId of uniqueStrings(game.itemIds)) {
      const current = raw.get(itemId) ?? { wins: 0, games: 0 };
      current.games += 1;
      current.wins += game.win ? 1 : 0;
      raw.set(itemId, current);
    }
  }

  for (const [itemId, itemStats] of raw) {
    if (itemStats.games < MIN_BUILD_WINRATE_GAMES) {
      continue;
    }

    const winRate = Math.round((itemStats.wins / itemStats.games) * 1000) / 10;

    if (winRate >= stats.winRate) {
      samples.set(itemId, {
        ...itemStats,
        winRate,
        lift: winRate - stats.winRate
      });
    }
  }

  return samples;
}

function sampleItemScore(itemId: string, frequency: Map<string, number>, positiveSamples: Map<string, { games: number; lift: number }>) {
  const positive = positiveSamples.get(itemId);

  return (frequency.get(itemId) ?? 0) * 12 + (positive ? POSITIVE_BUILD_ITEM_BOOST + positive.games + positive.lift * 35 : 0);
}

function uniqueScoredItemsByName<T extends { item: GameItem }>(items: T[]) {
  const seen = new Set<string>();
  const uniqueItems: T[] = [];

  for (const entry of items) {
    const key = itemNameKey(entry.item);

    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(entry);
    }
  }

  return uniqueItems;
}

function itemNameKey(item: GameItem) {
  return item.name.trim().toLowerCase();
}

function combinations(values: string[], size: number) {
  const result: string[][] = [];

  function visit(start: number, picked: string[]) {
    if (picked.length === size) {
      result.push(picked);
      return;
    }

    for (let index = start; index < values.length; index += 1) {
      visit(index + 1, [...picked, values[index]]);
    }
  }

  visit(0, []);
  return result;
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

function pickUnique<T extends { id: string }>(list: T[], seed: string, count: number, excluded: string[]) {
  const excludedSet = new Set(excluded);
  const sorted = [...list].sort((a, b) => seededIndex(`${seed}:${a.id}`, 1000) - seededIndex(`${seed}:${b.id}`, 1000));
  const picked: T[] = [];

  for (const item of sorted) {
    if (!excludedSet.has(item.id)) {
      picked.push(item);
      excludedSet.add(item.id);
    }

    if (picked.length === count) {
      break;
    }
  }

  return picked;
}

function scoreItemForMatchup(item: GameItem, champion: PublicChampion, enemyTeam: PublicChampion[]): number {
  const enemyTanks = enemyTeam.filter((enemy) => enemy.roles.includes("Tank")).length;
  const enemyAssassins = enemyTeam.filter((enemy) => enemy.roles.includes("Assassin")).length;
  const wantsAp = champion.roles.includes("Mage");
  const wantsAd = champion.roles.includes("Marksman") || champion.roles.includes("Fighter") || champion.roles.includes("Assassin");
  let score = item.goldTotal / 1000;

  if (wantsAp && item.tags.includes("SpellDamage")) score += 8;
  if (wantsAd && item.tags.includes("Damage")) score += 8;
  if (champion.roles.includes("Tank") && (item.tags.includes("Health") || item.tags.includes("Armor") || item.tags.includes("SpellBlock"))) score += 8;
  if (enemyTanks >= 2 && (item.tags.includes("ArmorPenetration") || item.tags.includes("MagicPenetration") || item.tags.includes("AttackSpeed"))) score += 5;
  if (enemyAssassins >= 2 && (item.tags.includes("Armor") || item.tags.includes("Health"))) score += 4;
  if (item.tags.includes("Boots")) score -= 5;

  return score;
}

function scoreBootsForMatchup(item: GameItem, champion: PublicChampion, enemyTeam: PublicChampion[]): number {
  const enemyPhysical = enemyTeam.filter((enemy) => enemy.roles.includes("Marksman") || enemy.roles.includes("Fighter") || enemy.roles.includes("Assassin")).length;
  const enemyMagic = enemyTeam.filter((enemy) => enemy.roles.includes("Mage") || enemy.roles.includes("Support")).length;
  let score = item.goldTotal / 100;

  if (champion.roles.includes("Marksman") && item.tags.includes("AttackSpeed")) score += 20;
  if (champion.roles.includes("Mage") && (item.tags.includes("MagicPenetration") || item.tags.includes("CooldownReduction"))) score += 18;
  if (champion.roles.includes("Tank") && item.tags.includes("Armor")) score += 14;
  if (enemyPhysical >= 3 && item.tags.includes("Armor")) score += 12;
  if (enemyMagic >= 3 && (item.tags.includes("SpellBlock") || item.tags.includes("Tenacity"))) score += 12;
  if (champion.roles.includes("Support") && item.tags.includes("NonbootsMovement")) score += 8;

  return score;
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
