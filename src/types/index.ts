export type ChallengeType =
  | "ability"
  | "champion"
  | "item-build"
  | "item-recipe"
  | "guess-elo"
  | "dodge-queue"
  | "skillshot-dodge";
export type AbilitySlot = "P" | "Q" | "W" | "E" | "R";
export type DamageType = "Physical" | "Magic" | "True" | "Mixed" | "Utility";

export type GuessStatus = "correct" | "present" | "wrong" | "higher" | "lower";

export interface Ability {
  id: string;
  championId: string;
  championName: string;
  slot: AbilitySlot;
  name: string;
  clue: string;
  damageType: DamageType;
}

export interface Champion {
  id: string;
  key: number;
  name: string;
  title: string;
  roles: string[];
  region: string;
  resource: string;
  gender: string;
  releaseYear: number;
  abilities: Ability[];
}

export interface GameItem {
  id: string;
  name: string;
  plaintext: string;
  tags: string[];
  goldTotal: number;
  purchasable: boolean;
  from: string[];
  into: string[];
  imageUrl: string;
}

export interface PublicChampion {
  id: string;
  key?: number;
  name: string;
  title: string;
  roles: string[];
  region: string;
  resource: string;
  gender: string;
  releaseYear: number;
  squareUrl: string;
  splashUrl: string;
}

export interface SummonerSpellRef {
  id: number;
  key: string;
  name: string;
  iconUrl: string;
}

export interface OptionItem {
  id: string;
  label: string;
  sublabel?: string;
  imageUrl?: string;
  spells?: SummonerSpellRef[];
}

export interface PublicAbilityChallenge {
  id: string;
  type: "ability";
  date: string;
  seed: string;
  difficulty: "normal" | "hard" | "expert";
  maxAttempts: number;
  clue: string;
  splashUrl: string;
  squareUrl: string;
  slots: AbilitySlot[];
}

export interface PublicChampionChallenge {
  id: string;
  type: "champion";
  date: string;
  seed: string;
  difficulty: "normal" | "hard" | "expert";
  maxAttempts: number;
  splashUrl: string;
  quote: string;
}

export type PublicChallenge = PublicAbilityChallenge | PublicChampionChallenge;

export interface ItemBuildChallenge {
  id: string;
  type: "item-build";
  date: string;
  champion: PublicChampion;
  enemyTeam: PublicChampion[];
  candidates: GameItem[];
  possibleItems: GameItem[];
  possibleBoots: GameItem[];
  answerItemId: string;
  answerItemIds: string[];
  answerBootsId: string;
  matchupNotes: string[];
  catalogModel: {
    source: string;
    candidateCount: number;
    targetItemCount: number;
  };
}

export interface ItemRecipeChallenge {
  id: string;
  type: "item-recipe";
  date: string;
  resultItem: GameItem;
  knownComponents: GameItem[];
  missingComponentId: string;
  options: GameItem[];
  allComponents: GameItem[];
}

export interface GuessEloRound {
  id: string;
  date: string;
  lanes: Array<{
    role: string;
    champion: PublicChampion;
    spells: SummonerSpellRef[];
  }>;
  enemyLanes: Array<{
    role: string;
    champion: PublicChampion;
    spells: SummonerSpellRef[];
  }>;
  options: string[];
  answerTier: string;
  signalNotes: string[];
  dataSource: string;
  sourceMatch?: {
    matchId: string;
    gameVersion: string;
    queueId: number;
    platform: string;
  };
  unavailableReason?: string;
}

export interface GuessEloChallenge extends GuessEloRound {
  type: "guess-elo";
  rounds?: GuessEloRound[];
}

export interface DodgeQueueRound {
  id: string;
  date: string;
  allyTeam: PublicChampion[];
  enemyTeam: PublicChampion[];
  allySpells: SummonerSpellRef[][];
  enemySpells: SummonerSpellRef[][];
  allyBans: PublicChampion[];
  enemyBans: PublicChampion[];
  answer: "queue" | "dodge";
  explanation: string;
  sourceMatch?: {
    matchId: string;
    gameVersion: string;
    queueId: number;
    platform: string;
    allyTeamWon: boolean;
  };
  unavailableReason?: string;
}

export interface DodgeQueueChallenge extends DodgeQueueRound {
  type: "dodge-queue";
  rounds?: DodgeQueueRound[];
}

export interface SkillshotDodgeChallenge {
  id: string;
  type: "skillshot-dodge";
  date: string;
  title: string;
  difficulty: string;
  durationSeconds: number;
  arena: {
    width: number;
    height: number;
  };
  player: {
    moveSpeed: number;
    radius: number;
    health: number;
  };
}

export interface ExpandedDailyChallenges {
  itemBuild: ItemBuildChallenge;
  itemRecipe: ItemRecipeChallenge;
  guessElo: GuessEloChallenge;
  dodgeQueue: DodgeQueueChallenge;
  skillshotDodge: SkillshotDodgeChallenge;
}

export interface AbilityGuessInput {
  championId: string;
  slot: AbilitySlot;
}

export interface ChampionGuessInput {
  championId: string;
}

export interface AbilityGuessResult {
  correct: boolean;
  attemptNumber: number;
  maxAttempts: number;
  championCorrect: boolean;
  slotCorrect: boolean;
  solvedAnswer?: {
    championId: string;
    championName: string;
    slot: AbilitySlot;
    abilityName: string;
    squareUrl: string;
    splashUrl: string;
  };
  hints: string[];
}

export interface ChampionFeedbackRow {
  key: "roles" | "resource" | "titleLength" | "key";
  label: string;
  guessValue: string;
  status: GuessStatus;
}

export interface ChampionGuessResult {
  correct: boolean;
  attemptNumber: number;
  maxAttempts: number;
  guessedChampion: PublicChampion;
  feedback: ChampionFeedbackRow[];
  solvedAnswer?: PublicChampion;
}

export interface DailyChallengeResponse {
  date: string;
  resetAt: string;
  dataDragonVersion: string;
  persistence: "database" | "local";
  challenges: {
    ability: PublicAbilityChallenge;
    champion: PublicChampionChallenge;
  };
  extraChallenges: ExpandedDailyChallenges;
  champions: PublicChampion[];
  items: GameItem[];
  stats: UserStats;
}

export interface UserStats {
  username: string;
  currentStreak: number;
  maxStreak: number;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  perfectSolves: number;
  fastestSolveMs: number | null;
  favoriteRole: string;
  rank: string;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  currentStreak: number;
  maxStreak: number;
  gamesPlayed: number;
  winRate: number;
  fastestSolveMs: number | null;
  perfectSolves: number;
}
