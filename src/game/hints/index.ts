import { getAbilityById, getChampionById } from "@/game/data/champions";

export function getAbilityHints(answerId: string, attemptNumber: number): string[] {
  const ability = getAbilityById(answerId);

  if (!ability) {
    return [];
  }

  const champion = getChampionById(ability.championId);

  if (!champion) {
    return [];
  }

  const orderedHints = [
    `Role: ${champion.roles.join(" / ")}`,
    `Resource: ${champion.resource}`,
    `Region: ${champion.region}`,
    `Release year: ${champion.releaseYear}`,
    `Damage type: ${ability.damageType}`
  ];

  return orderedHints.slice(0, Math.max(0, attemptNumber));
}
