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
import { createRealItemRecipeChallenge } from "@/game/item-recipes";

import { getUtcDateKey, seededIndex } from "./daily";

type VerifiedBuildTarget = {
  source: VerifiedBuildRound;
  answerBuild: GameItem[];
  answerBoots: GameItem;
  possibleItems: GameItem[];
  possibleBoots: GameItem[];
};

const BUILD_RELEVANT_ITEM_LIMIT = 24;
const TIER_TWO_BOOT_IDS = new Set(["3006", "3008", "3009", "3020", "3047", "3111", "3158"]);

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

  const rounds = playable.map((target) => toItemBuildChallenge(date, `${date}:item-build:${target.source.id}`, target, version));
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

  const possibleItems = selectChampionRelevantBuildItems(round, selected.answerBuild, itemCatalog);
  const bootSelection = selectBuildBootsForRole(round.role, selected.answerBoots, [
    selected.answerBoots,
    ...itemCatalog.filter(isBootUpgrade)
  ]);

  if (!bootSelection || possibleItems.length < 5 || bootSelection.possibleBoots.length === 0 || round.allyTeam.length < 5 || round.enemyTeam.length < 5) {
    return undefined;
  }

  return {
    source: round,
    answerBuild: selected.answerBuild,
    answerBoots: bootSelection.answerBoots,
    possibleItems,
    possibleBoots: bootSelection.possibleBoots
  };
}

function selectBuildBootsForRole(role: string | undefined, answerBoots: GameItem, sourceBoots: GameItem[]) {
  const uniqueBoots = uniqueItemsByName(sourceBoots);
  const isMid = isMidBuildRole(role);
  let effectiveAnswer = answerBoots;

  if (isMid && !isTierThreeBootUpgrade(answerBoots)) {
    effectiveAnswer = findTierThreeBootReplacement(answerBoots, uniqueBoots) ?? answerBoots;
  }

  if (!isMid && isTierThreeBootUpgrade(effectiveAnswer)) {
    const tierTwoReplacement = findTierTwoBootReplacement(answerBoots, uniqueBoots);

    if (!tierTwoReplacement) {
      return null;
    }

    effectiveAnswer = tierTwoReplacement;
  }

  const possibleBoots = uniqueItemsByName([effectiveAnswer, ...uniqueBoots.flatMap((item) => {
    if (isMid) {
      if (isTierThreeBootUpgrade(item)) {
        return [item];
      }

      const tierThreeReplacement = findTierThreeBootReplacement(item, uniqueBoots);
      return tierThreeReplacement ? [tierThreeReplacement] : [];
    }

    if (isTierThreeBootUpgrade(item)) {
      return [];
    }

    return [item];
  })]);

  return {
    answerBoots: effectiveAnswer,
    possibleBoots
  };
}

function isMidBuildRole(role: string | undefined) {
  return role?.trim().toLowerCase().includes("mid") ?? false;
}

function isTierThreeBootUpgrade(item: GameItem) {
  return (
    item.purchasable &&
    item.name !== "Boots" &&
    item.into.length === 0 &&
    item.from.some((id) => TIER_TWO_BOOT_IDS.has(id)) &&
    !item.tags.includes("Consumable") &&
    !item.tags.includes("Trinket")
  );
}

function findTierTwoBootReplacement(tierThreeBoots: GameItem, sourceBoots: GameItem[]) {
  return sourceBoots.find((item) => tierThreeBoots.from.includes(item.id) && isBootUpgrade(item) && !isTierThreeBootUpgrade(item));
}

function findTierThreeBootReplacement(tierTwoBoots: GameItem, sourceBoots: GameItem[]) {
  return sourceBoots.find((item) => item.from.includes(tierTwoBoots.id) && isTierThreeBootUpgrade(item));
}

function itemNameKey(item: GameItem) {
  return item.name.trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

type VerifiedBuildItemProfile = {
  answerTagCounts: Map<string, number>;
  answerTags: Set<string>;
  answerSignalTags: Set<string>;
  primaryTags: Set<string>;
  roleTags: Set<string>;
  championResource: string;
  hasAdCarryPattern: boolean;
  hasAdCarryCorePattern: boolean;
  hasApPattern: boolean;
  hasApCorePattern: boolean;
  hasSupportPattern: boolean;
  hasSupportCorePattern: boolean;
  hasDefensivePattern: boolean;
  isJungleBuild: boolean;
};

const BUILD_LOW_SIGNAL_TAGS = new Set(["Active", "Aura", "Lane", "Slow", "Stealth", "Vision", "NonbootsMovement"]);
const BUILD_PRIMARY_TAGS = new Set([
  "AbilityHaste",
  "Armor",
  "ArmorPenetration",
  "AttackSpeed",
  "CooldownReduction",
  "CriticalStrike",
  "Damage",
  "GoldPer",
  "Health",
  "LifeSteal",
  "MagicPenetration",
  "MagicResist",
  "Mana",
  "ManaRegen",
  "OnHit",
  "SpellBlock",
  "SpellDamage",
  "SpellVamp",
  "Tenacity"
]);
const AD_CARRY_TAGS = new Set(["AttackSpeed", "CriticalStrike", "OnHit", "LifeSteal"]);
const AD_CARRY_CORE_TAGS = new Set(["AttackSpeed", "CriticalStrike", "OnHit", "LifeSteal"]);
const AP_TAGS = new Set(["Mana", "MagicPenetration", "SpellDamage", "SpellVamp"]);
const AP_CORE_TAGS = new Set(["MagicPenetration", "SpellDamage", "SpellVamp"]);
const SUPPORT_TAGS = new Set(["GoldPer", "ManaRegen", "HealAndShieldPower"]);
const DEFENSIVE_TAGS = new Set(["Armor", "Health", "MagicResist", "SpellBlock", "Tenacity"]);
const DEFENSIVE_IDENTITY_TAGS = new Set(["Armor", "MagicResist", "SpellBlock", "Tenacity"]);

function selectChampionRelevantBuildItems(round: VerifiedBuildRound, answerBuild: GameItem[], itemCatalog: GameItem[]) {
  const answerIds = new Set(answerBuild.map((item) => item.id));
  const uniqueItems = uniqueItemsByName([...answerBuild, ...itemCatalog.filter(isBuildCandidateItem)]);
  const profile = getVerifiedBuildItemProfile(round, answerBuild);
  const [minAnswerGold, maxAnswerGold] = answerGoldRange(answerBuild);
  const scoredDistractors = uniqueItems
    .filter((item) => !answerIds.has(item.id))
    .map((item) => ({
      item,
      looseScore: verifiedBuildItemSimilarityScore(item, profile, minAnswerGold, maxAnswerGold),
      score: verifiedBuildItemRelevanceScore(item, profile, minAnswerGold, maxAnswerGold)
    }));
  const relevantDistractors = scoredDistractors
    .filter(({ score }) => score >= 10)
    .sort((a, b) => b.score - a.score || b.item.goldTotal - a.item.goldTotal || a.item.name.localeCompare(b.item.name))
    .map(({ item }) => item);
  const similarBackfill = scoredDistractors
    .filter(({ score }) => score < 10)
    .sort((a, b) => b.looseScore - a.looseScore || b.score - a.score || b.item.goldTotal - a.item.goldTotal || a.item.name.localeCompare(b.item.name))
    .map(({ item }) => item);

  return fillVerifiedBuildItemPool(answerBuild, [relevantDistractors, similarBackfill]);
}

function getVerifiedBuildItemProfile(round: VerifiedBuildRound, answerItems: GameItem[]): VerifiedBuildItemProfile {
  const answerTagCounts = new Map<string, number>();

  for (const item of answerItems) {
    for (const tag of item.tags) {
      answerTagCounts.set(tag, (answerTagCounts.get(tag) ?? 0) + 1);
    }
  }

  const answerTags = new Set(answerTagCounts.keys());
  const answerSignalTags = new Set([...answerTags].filter((tag) => !BUILD_LOW_SIGNAL_TAGS.has(tag)));
  const primaryTags = new Set(
    [...answerTagCounts.entries()]
      .filter(
        ([tag, count]) =>
          BUILD_PRIMARY_TAGS.has(tag) &&
          !BUILD_LOW_SIGNAL_TAGS.has(tag) &&
          (count >= 2 || !["Damage", "Health", "AbilityHaste", "CooldownReduction"].includes(tag))
      )
      .map(([tag]) => tag)
  );

  if (primaryTags.size === 0) {
    for (const tag of answerTags) {
      if (BUILD_PRIMARY_TAGS.has(tag) && !BUILD_LOW_SIGNAL_TAGS.has(tag)) {
        primaryTags.add(tag);
      }
    }
  }

  const roleTags = getBuildRoleItemTags(round);
  const roleText = normalizeBuildText([round.champion.roles.join(" "), round.role].join(" "));
  const isJungleBuild = roleText.includes("jungle") || answerTags.has("Jungle");

  return {
    answerTagCounts,
    answerSignalTags,
    answerTags,
    championResource: normalizeBuildText(round.champion.resource),
    hasAdCarryPattern: hasAny(answerTags, AD_CARRY_TAGS) || roleText.includes("marksman") || roleText.includes("bottom") || roleText.includes("bot"),
    hasAdCarryCorePattern: hasAny(answerSignalTags, AD_CARRY_CORE_TAGS) && (roleText.includes("marksman") || roleText.includes("bottom") || roleText.includes("bot") || hasAny(answerTags, AD_CARRY_TAGS)),
    hasApCorePattern: hasAny(answerSignalTags, AP_CORE_TAGS),
    hasApPattern: hasAny(answerTags, AP_TAGS) || roleText.includes("mage"),
    hasDefensivePattern: hasAny(answerTags, DEFENSIVE_IDENTITY_TAGS) || countOverlap(answerSignalTags, DEFENSIVE_TAGS) >= 2,
    hasSupportPattern: hasAny(answerTags, SUPPORT_TAGS) || roleText.includes("support") || roleText.includes("utility"),
    hasSupportCorePattern: hasAny(answerSignalTags, SUPPORT_TAGS),
    isJungleBuild,
    primaryTags,
    roleTags
  };
}

function verifiedBuildItemRelevanceScore(item: GameItem, profile: VerifiedBuildItemProfile, minAnswerGold: number, maxAnswerGold: number) {
  if (!isVerifiedBuildItemArchetypeCompatible(item, profile)) {
    return 0;
  }

  let score = 0;
  let primaryOverlap = 0;
  let weightedAnswerOverlap = 0;

  for (const tag of item.tags) {
    if (profile.primaryTags.has(tag)) {
      primaryOverlap += 1;
      score += 7 * (profile.answerTagCounts.get(tag) ?? 1);
    }

    if (profile.answerSignalTags.has(tag)) {
      const tagWeight = profile.answerTagCounts.get(tag) ?? 1;
      weightedAnswerOverlap += tagWeight;
      score += 3 * tagWeight;
    }

    if (profile.roleTags.has(tag) && profile.answerSignalTags.has(tag)) {
      score += 1;
    }
  }

  if (primaryOverlap === 0 && weightedAnswerOverlap < 2) {
    return 0;
  }

  if (item.goldTotal >= minAnswerGold - 600 && item.goldTotal <= maxAnswerGold + 600) {
    score += 2;
  }

  if (item.goldTotal >= 2400) {
    score += 1;
  }

  return score;
}

function verifiedBuildItemSimilarityScore(item: GameItem, profile: VerifiedBuildItemProfile, minAnswerGold: number, maxAnswerGold: number) {
  const tags = new Set(item.tags);
  let score = 0;

  for (const tag of item.tags) {
    if (profile.primaryTags.has(tag)) {
      score += 5 * (profile.answerTagCounts.get(tag) ?? 1);
    } else if (profile.answerSignalTags.has(tag)) {
      score += 2 * (profile.answerTagCounts.get(tag) ?? 1);
    }

    if (profile.roleTags.has(tag)) {
      score += 1;
    }
  }

  if (profile.hasAdCarryCorePattern && isMarksmanBuildChoice(tags)) {
    score += 6;
  }

  if (profile.hasApCorePattern && hasAny(tags, AP_TAGS)) {
    score += 6;
  }

  if (profile.hasSupportCorePattern && hasAny(tags, SUPPORT_TAGS)) {
    score += 6;
  }

  if (profile.hasDefensivePattern && hasAny(tags, DEFENSIVE_TAGS)) {
    score += 3;
  }

  if (tags.has("Jungle") && !profile.isJungleBuild) {
    score -= 20;
  }

  if (item.goldTotal >= minAnswerGold - 700 && item.goldTotal <= maxAnswerGold + 700) {
    score += 2;
  }

  return score;
}

function fillVerifiedBuildItemPool(answerItems: GameItem[], candidateGroups: GameItem[][]) {
  const targetCount = Math.max(BUILD_RELEVANT_ITEM_LIMIT, answerItems.length);
  const selected: GameItem[] = [];
  const selectedNames = new Set<string>();

  for (const item of answerItems) {
    const key = itemNameKey(item);
    if (!selectedNames.has(key)) {
      selected.push(item);
      selectedNames.add(key);
    }
  }

  for (const candidates of candidateGroups) {
    for (const item of candidates) {
      if (selected.length >= targetCount) {
        break;
      }

      const key = itemNameKey(item);
      if (!selectedNames.has(key)) {
        selected.push(item);
        selectedNames.add(key);
      }
    }
  }

  return selected.slice(0, targetCount);
}

function isVerifiedBuildItemArchetypeCompatible(item: GameItem, profile: VerifiedBuildItemProfile) {
  const tags = new Set(item.tags);

  if (tags.has("Jungle") && !profile.isJungleBuild) {
    return false;
  }

  if (hasAny(tags, SUPPORT_TAGS) && !profile.hasSupportPattern) {
    return false;
  }

  if (profile.hasSupportCorePattern && !hasAny(tags, SUPPORT_TAGS) && countOverlap(tags, profile.primaryTags) === 0) {
    return false;
  }

  if (hasAny(tags, AP_TAGS) && !profile.hasApPattern) {
    return false;
  }

  if (
    profile.hasApCorePattern &&
    !hasAny(tags, AP_TAGS) &&
    !(profile.hasDefensivePattern && hasAny(tags, DEFENSIVE_IDENTITY_TAGS) && countOverlap(tags, profile.primaryTags) > 0)
  ) {
    return false;
  }

  if (tags.has("Mana") && profile.championResource && !profile.championResource.includes("mana") && !profile.answerTags.has("Mana")) {
    return false;
  }

  if (hasAny(tags, AD_CARRY_TAGS) && !profile.hasAdCarryPattern && countOverlap(tags, profile.primaryTags) === 0) {
    return false;
  }

  if (
    profile.hasAdCarryCorePattern &&
    !isMarksmanBuildChoice(tags)
  ) {
    return false;
  }

  if (hasAny(tags, DEFENSIVE_TAGS) && !profile.hasDefensivePattern && countOverlap(tags, profile.primaryTags) === 0) {
    return false;
  }

  return true;
}

function isMarksmanBuildChoice(tags: Set<string>) {
  if (tags.has("CriticalStrike")) {
    return true;
  }

  if (tags.has("Damage") && hasAny(tags, DEFENSIVE_IDENTITY_TAGS) && !tags.has("Health") && !tags.has("CooldownReduction") && !tags.has("AbilityHaste")) {
    return true;
  }

  if ((tags.has("AttackSpeed") || tags.has("OnHit") || tags.has("LifeSteal")) && !tags.has("Health") && !tags.has("CooldownReduction") && !tags.has("AbilityHaste")) {
    return true;
  }

  return false;
}

function getBuildRoleItemTags(round: VerifiedBuildRound) {
  const roleTags = new Set<string>();
  const sourceRoles = [round.champion.roles.join(" "), round.role].map((role) => normalizeBuildText(role));
  const add = (...tags: string[]) => tags.forEach((tag) => roleTags.add(tag));

  for (const role of sourceRoles) {
    if (role.includes("marksman") || role.includes("bottom") || role.includes("bot")) {
      add("Damage", "CriticalStrike", "AttackSpeed", "ArmorPenetration", "LifeSteal", "OnHit");
    }

    if (role.includes("mage") || role.includes("mid")) {
      add("SpellDamage", "Mana", "MagicPenetration", "CooldownReduction");
    }

    if (role.includes("assassin")) {
      add("Damage", "ArmorPenetration", "CooldownReduction", "NonbootsMovement");
    }

    if (role.includes("fighter") || role.includes("jungle")) {
      add("Damage", "Health", "ArmorPenetration", "AttackSpeed", "LifeSteal", "CooldownReduction");
    }

    if (role.includes("tank") || role.includes("top")) {
      add("Health", "Armor", "SpellBlock", "CooldownReduction", "NonbootsMovement");
    }

    if (role.includes("support") || role.includes("utility")) {
      add("Health", "ManaRegen", "GoldPer", "HealAndShieldPower", "CooldownReduction", "Armor", "SpellBlock");
    }
  }

  return roleTags;
}

function answerGoldRange(answerItems: GameItem[]) {
  const totals = answerItems.map((item) => item.goldTotal);
  return [Math.min(...totals), Math.max(...totals)] as const;
}

function hasAny(values: Set<string>, candidates: Set<string>) {
  for (const value of candidates) {
    if (values.has(value)) {
      return true;
    }
  }

  return false;
}

function countOverlap(left: Set<string>, right: Set<string>) {
  let count = 0;

  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }

  return count;
}

function normalizeBuildText(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
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
  return createRealItemRecipeChallenge(date, seed, itemCatalog);
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
  return (
    item.purchasable &&
    item.name !== "Boots" &&
    item.goldTotal >= 900 &&
    (item.tags.includes("Boots") || item.from.some((id) => TIER_TWO_BOOT_IDS.has(id))) &&
    !item.tags.includes("Consumable") &&
    !item.tags.includes("Trinket")
  );
}
