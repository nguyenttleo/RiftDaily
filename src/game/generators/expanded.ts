import type {
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
  SkillshotDodgeChallenge,
  VerifiedBuildRound
} from "@/types";

import { getUtcDateKey, seededIndex } from "./daily";

type VerifiedBuildTarget = {
  source: VerifiedBuildRound;
  answerBuild: GameItem[];
  answerBoots: GameItem;
  possibleItems: GameItem[];
  possibleBoots: GameItem[];
};

export async function generateExpandedDailyChallenges(
  version: string,
  salt: string,
  publicChampions: PublicChampion[],
  gameItems: GameItem[],
  verifiedMatches?: {
    guessEloRounds: GuessEloRound[];
    dodgeQueueRounds: DodgeQueueRound[];
    buildRounds?: VerifiedBuildRound[];
    championMatchupRounds?: ChampionMatchupRound[];
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
      gameItems,
      version,
      verifiedMatches?.buildRounds ?? []
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
  itemCatalog: GameItem[],
  version: string,
  verifiedBuildRounds: VerifiedBuildRound[]
): ItemBuildChallenge {
  const playable = verifiedBuildRounds
    .map((round) => selectVerifiedBuildTarget(round, itemCatalog))
    .filter((target): target is VerifiedBuildTarget => Boolean(target))
    .sort((a, b) => seededIndex(`${seed}:${a.source.id}`, 10000) - seededIndex(`${seed}:${b.source.id}`, 10000));

  if (playable.length === 0) {
    return unavailableItemBuildChallenge(
      date,
      "Build needs a verified Challenger ranked win with five completed items and upgraded boots. Keep the live cache warming."
    );
  }

  const rounds = playable.map((target, index) => toItemBuildChallenge(date, `${date}:item-build:${index}`, target, version));
  const selected = rounds[seededIndex(seed, rounds.length)];

  return {
    ...selected,
    type: "item-build",
    id: `${date}:item-build`,
    rounds
  };
}

function toItemBuildChallenge(date: string, id: string, target: VerifiedBuildTarget, version: string): ItemBuildChallenge {
  const answerBuild = target.answerBuild;
  const answerBoots = target.answerBoots;

  return {
    id,
    type: "item-build",
    date,
    champion: target.source.champion,
    enemyTeam: target.source.enemyTeam.map((pick) => pick.champion),
    allyTeam: target.source.allyTeam,
    enemyPlayers: target.source.enemyTeam,
    targetPlayerName: target.source.playerName,
    ...(typeof target.source.playerLp === "number" ? { targetPlayerLp: target.source.playerLp } : {}),
    targetRole: target.source.role,
    candidates: answerBuild.slice(0, 4),
    possibleItems: target.possibleItems,
    possibleBoots: target.possibleBoots,
    answerItemId: answerBuild[0].id,
    answerItemIds: answerBuild.map((item) => item.id),
    answerBootsId: answerBoots.id,
    matchupNotes: [],
    sourceMatch: target.source.sourceMatch,
    catalogModel: {
      source: `${target.source.dataSource} + Riot Data Dragon ${version}`,
      candidateCount: target.possibleItems.length,
      targetItemCount: answerBuild.length
    }
  };
}

function buildTargetFromInventory(itemIds: string[], itemById: Map<string, GameItem>) {
  const items = uniqueStrings(itemIds)
    .map((itemId) => itemById.get(itemId))
    .filter(Boolean) as GameItem[];
  const nonTrinketItems = items.filter((item) => !item.tags.includes("Trinket"));
  const boots = nonTrinketItems.filter(isBootUpgrade);
  const answerBuild = uniqueItemsByName(nonTrinketItems.filter(isBuildCandidateItem));

  if (
    nonTrinketItems.length !== 6 ||
    boots.length !== 1 ||
    answerBuild.length !== 5 ||
    new Set(answerBuild.map((item) => item.id)).size !== 5
  ) {
    return undefined;
  }

  const [answerBoots] = boots;

  return {
    answerBuild,
    answerBoots
  };
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

function unavailableItemBuildChallenge(date: string, reason: string): ItemBuildChallenge {
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
    unavailableReason: reason,
    catalogModel: {
      source: "Riot Match-V5",
      candidateCount: 0,
      targetItemCount: 0
    }
  };
}

function selectVerifiedBuildTarget(round: VerifiedBuildRound, itemCatalog: GameItem[]): VerifiedBuildTarget | undefined {
  const itemById = new Map(itemCatalog.map((item) => [item.id, item]));
  const selected = buildTargetFromInventory(round.itemIds, itemById);

  if (!selected) {
    return undefined;
  }

  const possibleItems = uniqueItemsByName([
    ...selected.answerBuild,
    ...itemCatalog.filter(isBuildCandidateItem)
  ]).slice(0, 72);
  const possibleBoots = uniqueItemsByName([
    selected.answerBoots,
    ...itemCatalog.filter(isBootUpgrade)
  ]);

  if (possibleItems.length < 5 || possibleBoots.length === 0 || round.allyTeam.length < 5 || round.enemyTeam.length < 5) {
    return undefined;
  }

  return {
    source: round,
    answerBuild: selected.answerBuild,
    answerBoots: selected.answerBoots,
    possibleItems,
    possibleBoots
  };
}

function itemNameKey(item: GameItem) {
  return item.name.trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isBuildCandidateItem(item: GameItem) {
  return (
    item.purchasable &&
    item.goldTotal >= 1600 &&
    item.into.length === 0 &&
    item.tags.length > 0 &&
    !item.tags.includes("Consumable") &&
    !item.tags.includes("Trinket") &&
    !item.tags.includes("Boots")
  );
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
  return item.purchasable && item.name !== "Boots" && item.tags.includes("Boots") && item.goldTotal >= 900 && !item.tags.includes("Consumable") && !item.tags.includes("Trinket");
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
