export interface TftItemRef {
  id: string;
  name: string;
  imageUrl: string;
}

export interface TftUnitRef {
  id: string;
  name: string;
  cost: number;
  role: string;
  traits: string[];
  imageUrl: string;
}

export interface TftRecipeRound {
  id: string;
  resultItem: TftItemRef;
  components: TftItemRef[];
  options: TftItemRef[];
}

export interface TftConnectionsCategory {
  id: string;
  label: string;
  kind: "synergy" | "unit type" | "cost";
  unitIds: string[];
}

export interface TftConnectionsRound {
  id: string;
  units: TftUnitRef[];
  categories: TftConnectionsCategory[];
}

export interface TftDailyResponse {
  product: "tft";
  date: string;
  resetAt: string;
  dataDragonVersion: string;
  setNumber: number;
  recipe: {
    type: "tft-recipe";
    rounds: TftRecipeRound[];
  };
  connections: {
    type: "tft-connections";
    rounds: TftConnectionsRound[];
  };
}
