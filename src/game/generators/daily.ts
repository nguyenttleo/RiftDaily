import { abilities, abilitySlots, champions, getAbilityById, getChampionById } from "@/game/data/champions";
import { championSplashUrl, championSquareUrl, toPublicChampion } from "@/lib/riot/data-dragon";
import type { PublicAbilityChallenge, PublicChampionChallenge } from "@/types";

export interface InternalAbilityChallenge {
  publicChallenge: PublicAbilityChallenge;
  answerId: string;
}

export interface InternalChampionChallenge {
  publicChallenge: PublicChampionChallenge;
  answerId: string;
}

export interface InternalDailyChallengeSet {
  date: string;
  resetAt: string;
  ability: InternalAbilityChallenge;
  champion: InternalChampionChallenge;
}

export function getUtcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getNextUtcReset(date = new Date()): string {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return next.toISOString();
}

export function seededIndex(seed: string, length: number): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return Math.abs(hash >>> 0) % length;
}

export function difficultyForSeed(seed: string): "normal" | "hard" | "expert" {
  const bucket = seededIndex(`${seed}:difficulty`, 10);

  if (bucket >= 8) {
    return "expert";
  }

  if (bucket >= 5) {
    return "hard";
  }

  return "normal";
}

export function generateDailyChallengeSet(
  version: string,
  salt: string,
  date = new Date()
): InternalDailyChallengeSet {
  const dateKey = getUtcDateKey(date);
  const abilitySeed = `${salt}:${dateKey}:ability`;
  const championSeed = `${salt}:${dateKey}:champion`;
  const ability = abilities[seededIndex(abilitySeed, abilities.length)];
  const champion = champions[seededIndex(championSeed, champions.length)];

  return {
    date: dateKey,
    resetAt: getNextUtcReset(date),
    ability: createAbilityChallenge(ability.id, dateKey, abilitySeed, version),
    champion: createChampionChallenge(champion.id, dateKey, championSeed, version)
  };
}

export function createAbilityChallenge(
  abilityId: string,
  date: string,
  seed: string,
  version: string,
  id = `${date}:ability`
): InternalAbilityChallenge {
  const ability = getAbilityById(abilityId);

  if (!ability) {
    throw new Error(`Unknown ability answer: ${abilityId}`);
  }

  const champion = getChampionById(ability.championId);

  if (!champion) {
    throw new Error(`Unknown champion answer: ${ability.championId}`);
  }

  return {
    answerId: ability.id,
    publicChallenge: {
      id,
      type: "ability",
      date,
      seed,
      difficulty: difficultyForSeed(seed),
      maxAttempts: 6,
      clue: ability.clue,
      squareUrl: championSquareUrl(version, champion.id),
      splashUrl: championSplashUrl(champion.id),
      slots: abilitySlots
    }
  };
}

export function createChampionChallenge(
  championId: string,
  date: string,
  seed: string,
  version: string,
  id = `${date}:champion`
): InternalChampionChallenge {
  const champion = getChampionById(championId);

  if (!champion) {
    throw new Error(`Unknown champion answer: ${championId}`);
  }

  return {
    answerId: champion.id,
    publicChallenge: {
      id,
      type: "champion",
      date,
      seed,
      difficulty: difficultyForSeed(seed),
      maxAttempts: 8,
      splashUrl: championSplashUrl(champion.id),
      quote: toPublicChampion(champion, version).title
    }
  };
}
