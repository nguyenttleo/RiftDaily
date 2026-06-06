import { champions, getItemById, items } from "@/game/data/champions";
import { toPublicChampion } from "@/lib/riot/data-dragon";
import type {
  DodgeQueueChallenge,
  ExpandedDailyChallenges,
  GameItem,
  GuessEloChallenge,
  ItemBuildChallenge,
  ItemRecipeChallenge,
  PublicChampion,
  SkillshotDodgeChallenge
} from "@/types";

import { getUtcDateKey, seededIndex } from "./daily";

const laneRoles = ["Top", "Jungle", "Mid", "Bot", "Supp"];
const nonJungleSpellPairs = [
  ["Flash", "Teleport"],
  ["Flash", "Ignite"],
  ["Flash", "Heal"],
  ["Exhaust", "Ignite"],
  ["Barrier", "Flash"],
  ["Cleanse", "Flash"],
  ["Ignite", "Teleport"],
  ["Ghost", "Teleport"],
  ["Heal", "Barrier"]
];
const jungleSpellPairs = [
  ["Flash", "Smite"],
  ["Ghost", "Smite"],
  ["Ignite", "Smite"]
];

export async function generateExpandedDailyChallenges(
  version: string,
  salt: string,
  date = new Date()
): Promise<ExpandedDailyChallenges> {
  const dateKey = getUtcDateKey(date);
  const publicChampions = champions.map((champion) => toPublicChampion(champion, version));

  return {
    itemBuild: generateItemBuildChallenge(dateKey, `${salt}:${dateKey}:item-build`, publicChampions),
    itemRecipe: generateItemRecipeChallenge(dateKey, `${salt}:${dateKey}:item-recipe`),
    guessElo: generateGuessEloChallenge(dateKey, `${salt}:${dateKey}:guess-elo`, publicChampions),
    dodgeQueue: generateDodgeQueueChallenge(dateKey, `${salt}:${dateKey}:dodge-queue`, publicChampions),
    skillshotDodge: generateSkillshotDodgeChallenge(dateKey)
  };
}

function generateItemBuildChallenge(date: string, seed: string, publicChampions: PublicChampion[]): ItemBuildChallenge {
  const champion = publicChampions[seededIndex(seed, publicChampions.length)];
  const enemyTeam = pickUnique(publicChampions, `${seed}:enemy`, 5, [champion.id]);
  const candidateItems = items
    .filter((item) => item.goldTotal >= 2200 && item.tags.length > 0 && !item.tags.includes("Consumable") && !item.tags.includes("Trinket"))
    .map((item) => ({
      item,
      score: scoreItemForMatchup(item, champion, enemyTeam)
    }))
    .sort((a, b) => b.score - a.score);
  const bootCandidates = items
    .filter((item) => isBootUpgrade(item))
    .map((item) => ({
      item,
      score: scoreBootsForMatchup(item, champion, enemyTeam)
    }))
    .sort((a, b) => b.score - a.score);
  const answerBuild = candidateItems.slice(0, 5).map((candidate) => candidate.item);
  const answer = answerBuild[0];
  const answerBoots = bootCandidates[0]?.item ?? items.find((item) => item.tags.includes("Boots") && item.name !== "Boots") ?? answer;
  const possibleItems = candidateItems
    .filter((candidate) => candidate.score >= 6)
    .slice(0, 32)
    .map((candidate) => candidate.item);
  const possibleBoots = bootCandidates.map((candidate) => candidate.item);
  const candidates = [answer, ...candidateItems.slice(1).filter((candidate) => candidate.item.id !== answer.id).slice(0, 3).map((candidate) => candidate.item)]
    .sort((a, b) => seededIndex(`${seed}:${a.id}`, 1000) - seededIndex(`${seed}:${b.id}`, 1000));
  const projected = Math.min(64, Math.round((49 + candidateItems[0].score / 8) * 10) / 10);

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
    winrateModel: {
      source: "Data Dragon item stats + matchup heuristic",
      baseline: 49,
      projected
    }
  };
}

function generateItemRecipeChallenge(date: string, seed: string): ItemRecipeChallenge {
  const craftable = items.filter((item) =>
    item.from.length >= 2 &&
    item.from.every((id) => {
      const component = getItemById(id);
      return component && isRecipeComponent(component);
    })
  );
  const resultItem = craftable[seededIndex(seed, craftable.length)];
  const componentIds = resultItem.from;
  const missingComponentId = componentIds[seededIndex(`${seed}:missing`, componentIds.length)];
  const knownComponents = componentIds.filter((id) => id !== missingComponentId).map((id) => getItemById(id)).filter(Boolean) as GameItem[];
  const missing = getItemById(missingComponentId) ?? knownComponents[0];
  const distractors = items
    .filter((item) => item.id !== missing.id && item.goldTotal <= Math.max(missing.goldTotal + 500, 900))
    .slice(0, 80)
    .sort((a, b) => seededIndex(`${seed}:${a.id}`, 1000) - seededIndex(`${seed}:${b.id}`, 1000))
    .slice(0, 5);
  const allComponents = getRecipeComponents([missing.id]);

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

function generateGuessEloChallenge(date: string, seed: string, publicChampions: PublicChampion[]): GuessEloChallenge {
  const options = ["Iron/Bronze", "Silver/Gold", "Emerald/Diamond", "Master+"];
  const lanes = createGuessEloTeam(seed, publicChampions, "blue");
  const enemyLanes = createGuessEloTeam(seed, publicChampions, "red");
  const chaosScore = scoreGuessEloLanes([...lanes, ...enemyLanes]);
  const answerTier = chaosScore >= 7 ? "Iron/Bronze" : chaosScore >= 4 ? "Silver/Gold" : chaosScore >= 2 ? "Emerald/Diamond" : "Master+";

  return {
    id: `${date}:guess-elo`,
    type: "guess-elo",
    date,
    lanes,
    enemyLanes,
    options,
    answerTier,
    signalNotes: [
      `Comp chaos score: ${chaosScore}`,
      chaosScore >= 4 ? "Multiple role or summoner-spell mismatches point lower." : "Cleaner role fit and spell discipline point higher.",
      "Summoner spells and role fit drive the read."
    ],
    dataSource: "Loading-screen read"
  };
}

function generateDodgeQueueChallenge(date: string, seed: string, publicChampions: PublicChampion[]): DodgeQueueChallenge {
  const allyTeam = pickLaneAwareTeam(publicChampions, `${seed}:ally`, [], 7);
  const enemyTeam = pickLaneAwareTeam(publicChampions, `${seed}:enemy`, allyTeam.map((champion) => champion.id), 8);
  const allySpells = createLaneSpellLoadout(`${seed}:ally`);
  const enemySpells = createLaneSpellLoadout(`${seed}:enemy`);
  const pickedChampionIds = [...allyTeam, ...enemyTeam].map((champion) => champion.id);
  const allyBans = pickUnique(publicChampions, `${seed}:ally-bans`, 5, pickedChampionIds);
  const enemyBans = pickUnique(publicChampions, `${seed}:enemy-bans`, 5, [...pickedChampionIds, ...allyBans.map((champion) => champion.id)]);
  const allyRoleFit = laneRoles.reduce((score, role, index) => score + laneFit(role, allyTeam[index]), 0);
  const enemyThreat = enemyTeam.reduce((score, champion) => score + (champion.roles.includes("Tank") ? 1 : 0) + (champion.roles.includes("Assassin") ? 1 : 0), 0);
  const dodgeScore = 7 - allyRoleFit + enemyThreat;
  const answer = dodgeScore >= 6 ? "dodge" : "queue";
  const dodgePercent = Math.min(87, Math.max(19, 42 + dodgeScore * 6));

  return {
    id: `${date}:dodge-queue`,
    type: "dodge-queue",
    date,
    allyTeam,
    enemyTeam,
    allySpells,
    enemySpells,
    allyBans,
    enemyBans,
    answer,
    community: {
      dodgePercent,
      queuePercent: 100 - dodgePercent
    },
    explanation:
      answer === "dodge"
        ? "The lobby has enough role mismatch and enemy lockdown pressure that the model recommends dodging."
        : "The comp has workable role coverage and enough playable lanes to queue it up."
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

function createGuessEloTeam(seed: string, publicChampions: PublicChampion[], side: "blue" | "red") {
  return laneRoles.map((role) => {
    const champion = publicChampions[seededIndex(`${seed}:${side}:${role}`, publicChampions.length)];
    const spells = spellsForLane(role, `${seed}:${side}:${role}:spells`);
    return { role, champion, spells };
  });
}

function createLaneSpellLoadout(seed: string) {
  return laneRoles.map((role) => spellsForLane(role, `${seed}:${role}:spells`));
}

function spellsForLane(role: string, seed: string) {
  const pool = role === "Jungle" ? jungleSpellPairs : nonJungleSpellPairs;
  return pool[seededIndex(seed, pool.length)];
}

function scoreGuessEloLanes(lanes: GuessEloChallenge["lanes"]) {
  return lanes.reduce((total, lane, index) => {
    const smiteMismatch = lane.role === "Jungle" ? (lane.spells.includes("Smite") ? 0 : 4) : (lane.spells.includes("Smite") ? 4 : 0);
    const expected =
      lane.role === "Jungle"
        ? lane.spells.includes("Smite")
        : lane.role === "Bot"
          ? lane.champion.roles.includes("Marksman")
          : lane.role === "Supp"
          ? lane.champion.roles.includes("Support") || lane.champion.roles.includes("Tank")
          : true;
    return total + smiteMismatch + (expected ? 0 : 2) + (lane.spells.includes("Flash") ? 0 : 1) + (index % 5 === 0 && lane.spells.includes("Ignite") ? 1 : 0);
  }, 0);
}

function pickLaneAwareTeam(publicChampions: PublicChampion[], seed: string, excluded: string[], chaosThreshold: number) {
  const excludedSet = new Set(excluded);

  return laneRoles.map((role) => {
    const preferredPool = championsForGeneratedLane(publicChampions, role).filter((champion) => !excludedSet.has(champion.id));
    const available = publicChampions.filter((champion) => !excludedSet.has(champion.id));
    const chaosRoll = seededIndex(`${seed}:${role}:chaos`, 10);
    const pool = chaosRoll >= chaosThreshold || preferredPool.length === 0 ? available : preferredPool;
    const champion = pool[seededIndex(`${seed}:${role}:pick`, pool.length)] ?? available[0] ?? publicChampions[0];
    excludedSet.add(champion.id);
    return champion;
  });
}

function championsForGeneratedLane(publicChampions: PublicChampion[], role: string) {
  const pool = publicChampions.filter((champion) => {
    if (role === "Top") return champion.roles.some((championRole) => ["Fighter", "Tank"].includes(championRole));
    if (role === "Jungle") return champion.roles.some((championRole) => ["Assassin", "Fighter", "Tank"].includes(championRole));
    if (role === "Mid") return champion.roles.some((championRole) => ["Mage", "Assassin", "Fighter"].includes(championRole));
    if (role === "Bot") return champion.roles.includes("Marksman");
    return champion.roles.some((championRole) => ["Support", "Tank", "Mage"].includes(championRole));
  });

  return pool.length > 0 ? pool : publicChampions;
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

function getRecipeComponents(includeIds: string[] = []) {
  const include = new Set(includeIds);
  const candidates = items
    .filter((item) => isRecipeComponent(item) || include.has(item.id))
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

function isRecipeComponent(item: GameItem) {
  const usedByPurchasableItem = items.some((parent) => parent.purchasable && parent.from.includes(item.id));

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

function laneFit(role: string, champion: PublicChampion): number {
  if (role === "Jungle") return champion.roles.includes("Fighter") || champion.roles.includes("Tank") || champion.roles.includes("Assassin") ? 1 : 0;
  if (role === "Bot" || role === "ADC") return champion.roles.includes("Marksman") ? 1 : 0;
  if (role === "Supp" || role === "Support") return champion.roles.includes("Support") || champion.roles.includes("Tank") ? 1 : 0;
  if (role === "Mid") return champion.roles.includes("Mage") || champion.roles.includes("Assassin") ? 1 : 0;
  return champion.roles.includes("Fighter") || champion.roles.includes("Tank") ? 1 : 0;
}
