import type { GameItem, ItemRecipeChallenge } from "@/types";

import { seededIndex } from "./generators/daily";

type RealItemRecipe = {
  resultItem: GameItem;
  componentIds: string[];
  components: GameItem[];
};

export function createRealItemRecipeChallenge(date: string, seed: string, itemCatalog: GameItem[]): ItemRecipeChallenge {
  const recipes = getRealItemRecipes(itemCatalog);

  if (recipes.length === 0) {
    throw new Error("No verified Riot Data Dragon item recipes are available.");
  }

  const allComponents = getRecipeComponentChoices(recipes);
  const selectedRecipes = seededShuffle(recipes, seed);
  const rounds = selectedRecipes.map((recipe, index) =>
    createRecipeRound({
      date,
      seed,
      recipe,
      allComponents: [],
      roundIndex: index + 1
    })
  );
  const selected = rounds[seededIndex(`${seed}:daily`, rounds.length)];

  return {
    ...selected,
    id: `${date}:item-recipe`,
    allComponents,
    options: allComponents,
    rounds
  };
}

export function getRealItemRecipes(itemCatalog: GameItem[]): RealItemRecipe[] {
  const itemById = new Map(itemCatalog.map((item) => [item.id, item]));
  const recipes: RealItemRecipe[] = [];

  for (const item of itemCatalog) {
    const componentIds = item.from.filter((id) => itemById.has(id));

    if (!isRecipeResult(item) || componentIds.length !== item.from.length || componentIds.length < 2) {
      continue;
    }

    const components = componentIds
      .map((id) => itemById.get(id))
      .filter((component): component is GameItem => Boolean(component));

    if (components.length !== componentIds.length || components.some((component) => !isRecipeComponent(component))) {
      continue;
    }

    recipes.push({
      resultItem: item,
      componentIds,
      components
    });
  }

  return uniqueBy(recipes, (recipe) => recipe.resultItem.id).sort((a, b) =>
    a.resultItem.goldTotal - b.resultItem.goldTotal || a.resultItem.name.localeCompare(b.resultItem.name)
  );
}

function createRecipeRound({
  date,
  seed,
  recipe,
  allComponents,
  roundIndex
}: {
  date: string;
  seed: string;
  recipe: RealItemRecipe;
  allComponents: GameItem[];
  roundIndex: number;
}): ItemRecipeChallenge {
  const missingComponentIndex = seededIndex(`${seed}:${recipe.resultItem.id}:missing`, recipe.componentIds.length);
  const missingComponentId = recipe.componentIds[missingComponentIndex];
  const knownComponents = recipe.components.filter((_, index) => index !== missingComponentIndex);

  return {
    id: `${date}:item-recipe:${roundIndex}:${recipe.resultItem.id}`,
    type: "item-recipe",
    date,
    resultItem: recipe.resultItem,
    componentIds: recipe.componentIds,
    knownComponents,
    missingComponentId,
    missingComponentIndex,
    options: allComponents,
    allComponents
  };
}

function getRecipeComponentChoices(recipes: RealItemRecipe[]) {
  const byId = new Map<string, GameItem>();

  for (const recipe of recipes) {
    for (const component of recipe.components) {
      byId.set(component.id, component);
    }
  }

  return [...byId.values()].sort((a, b) => a.goldTotal - b.goldTotal || a.name.localeCompare(b.name));
}

function isRecipeResult(item: GameItem) {
  return (
    item.purchasable &&
    item.goldTotal > 0 &&
    item.from.length >= 2 &&
    !item.tags.includes("Consumable") &&
    !item.tags.includes("Trinket")
  );
}

function isRecipeComponent(item: GameItem) {
  return (
    item.purchasable &&
    item.goldTotal > 0 &&
    !item.tags.includes("Consumable") &&
    !item.tags.includes("Trinket")
  );
}

function seededShuffle<T extends { resultItem: { id: string } }>(items: T[], seed: string) {
  return [...items].sort((a, b) => {
    const aIndex = seededIndex(`${seed}:${a.resultItem.id}`, 100000);
    const bIndex = seededIndex(`${seed}:${b.resultItem.id}`, 100000);

    return aIndex - bIndex || a.resultItem.id.localeCompare(b.resultItem.id);
  });
}

function uniqueBy<T>(items: T[], keyForItem: (item: T) => string) {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    const key = keyForItem(item);

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}
