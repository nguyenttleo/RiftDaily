import type { AbilitySlot } from "@/types";

import { generatedChampions, generatedDataDragonVersion, generatedItems } from "./generated-catalog";

export const abilitySlots: AbilitySlot[] = ["P", "Q", "W", "E", "R"];

export const champions = generatedChampions;
export const abilities = champions.flatMap((champion) => champion.abilities);
export const items = generatedItems;
export const catalogDataDragonVersion = generatedDataDragonVersion;

export function getChampionById(id: string) {
  return champions.find((champion) => normalizeChampionId(champion.id) === normalizeChampionId(id));
}

export function getChampionByName(name: string) {
  return champions.find((champion) => normalizeChampionId(champion.name) === normalizeChampionId(name));
}

export function getAbilityById(id: string) {
  return abilities.find((ability) => ability.id === id);
}

export function getItemById(id: string) {
  return items.find((item) => item.id === id);
}

export function getItemByName(name: string) {
  return items.find((item) => normalizeChampionId(item.name) === normalizeChampionId(name));
}

export function normalizeChampionId(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
