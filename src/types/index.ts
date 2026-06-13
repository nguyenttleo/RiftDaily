export type ChallengeType =
  | "ability"
  | "champion"
  | "item-build"
  | "item-recipe"
  | "guess-elo"
  | "dodge-queue"
  | "champion-matchup"
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
  description?: string;
  descriptionHtml?: string;
  tags: string[];
  goldTotal: number;
  purchasable: boolean;
  from: string[];
  into: string[];
  maps?: Record<string, boolean>;
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

export interface BuildWinrateStats {
  championId: string;
  championName: string;
  wins: number;
  games: number;
  winRate: number;
  sampleMatches: number;
  buildWins?: number;
  buildGames?: number;
  buildWinRate?: number;
  buildSampleMatches?: number;
  targetItemIds?: string[];
  buildMatchedItemCount?: number;
  inventorySamples?: Array<{
    win: boolean;
    matchId: string;
    itemIds: string[];
    enemyChampionIds?: string[];
  }>;
  source: string;
}

export interface VerifiedMatchData {
  gameDurationSeconds?: number;
  gameMode: string;
  queueId: number;
  mapId: number;
  teams: Array<{
    teamId: 100 | 200;
    name: string;
    win: boolean;
    bans: PublicChampion[];
    participants: Array<{
      role: string;
      playerName?: string;
      champion: PublicChampion;
      spells: SummonerSpellRef[];
      items: Array<{
        id: string;
        imageUrl: string;
      }>;
      kills: number;
      deaths: number;
      assists: number;
      cs: number;
      gold: number;
      damageToChampions: number;
      visionScore: number;
      championLevel: number;
      mastery?: ChampionMasterySnapshot[];
    }>;
  }>;
}

export interface ChampionMasterySnapshot {
  champion: PublicChampion;
  championLevel: number;
  championPoints: number;
}

export interface PlayerMasterySnapshot {
  teamId: 100 | 200;
  role: string;
  playerName?: string;
  champion: PublicChampion;
  topChampions: ChampionMasterySnapshot[];
}

export interface VerifiedBuildPick {
  role: string;
  champion: PublicChampion;
  spells?: SummonerSpellRef[];
  playerName?: string;
}

export interface VerifiedBuildRound {
  id: string;
  date: string;
  champion: PublicChampion;
  playerName?: string;
  playerLp?: number;
  role: string;
  allyTeam: VerifiedBuildPick[];
  enemyTeam: VerifiedBuildPick[];
  itemIds: string[];
  dataSource: string;
  sourceMatch?: {
    matchId: string;
    gameId?: number;
    gameVersion: string;
    gameCreation?: number;
    queueId: number;
    platform: string;
    sourcePlayer?: string;
    matchData?: VerifiedMatchData;
  };
}

export interface OptionItem {
  id: string;
  label: string;
  sublabel?: string;
  imageUrl?: string;
  splashUrl?: string;
  spells?: SummonerSpellRef[];
  playerName?: string;
  mastery?: ChampionMasterySnapshot[];
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
  allyTeam?: VerifiedBuildPick[];
  enemyPlayers?: VerifiedBuildPick[];
  targetPlayerName?: string;
  targetPlayerLp?: number;
  targetRole?: string;
  candidates: GameItem[];
  possibleItems: GameItem[];
  possibleBoots: GameItem[];
  answerItemId: string;
  answerItemIds: string[];
  answerBootsId: string;
  matchupNotes: string[];
  winrateStats?: BuildWinrateStats;
  winrateSamples?: Record<string, BuildWinrateStats>;
  sourceMatch?: VerifiedBuildRound["sourceMatch"];
  rounds?: ItemBuildChallenge[];
  unavailableReason?: string;
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
  componentIds: string[];
  knownComponents: GameItem[];
  missingComponentId: string;
  missingComponentIndex: number;
  options: GameItem[];
  allComponents: GameItem[];
  rounds?: ItemRecipeChallenge[];
}

export interface GuessEloRound {
  id: string;
  date: string;
  lanes: Array<{
    role: string;
    champion: PublicChampion;
    spells: SummonerSpellRef[];
    playerName?: string;
    mastery?: ChampionMasterySnapshot[];
  }>;
  enemyLanes: Array<{
    role: string;
    champion: PublicChampion;
    spells: SummonerSpellRef[];
    playerName?: string;
    mastery?: ChampionMasterySnapshot[];
  }>;
  options: string[];
  answerTier: string;
  signalNotes: string[];
  dataSource: string;
  sourceMatch?: {
    matchId: string;
    gameId?: number;
    gameVersion: string;
    gameCreation?: number;
    queueId: number;
    platform: string;
    sourcePlayer?: string;
    matchData?: VerifiedMatchData;
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
  allyPlayerNames?: string[];
  enemyPlayerNames?: string[];
  allyBans: PublicChampion[];
  enemyBans: PublicChampion[];
  answer: "queue" | "dodge";
  explanation: string;
  sourceMatch?: {
    matchId: string;
    gameId?: number;
    gameVersion: string;
    gameCreation?: number;
    queueId: number;
    platform: string;
    allyTeamWon: boolean;
    allyTeamId?: 100 | 200;
    enemyTeamId?: 100 | 200;
    sourcePlayer?: string;
    matchData?: VerifiedMatchData;
  };
  unavailableReason?: string;
}

export interface DodgeQueueChallenge extends DodgeQueueRound {
  type: "dodge-queue";
  rounds?: DodgeQueueRound[];
}

export interface ChampionMatchupPick {
  champion: PublicChampion;
  role: string;
  wins: number;
  games: number;
  winRate: number;
  sampleMatches: number;
}

export interface ChampionMatchupRound {
  id: string;
  date: string;
  left: ChampionMatchupPick;
  right: ChampionMatchupPick;
  answerSide: "left" | "right";
  dataSource: string;
  unavailableReason?: string;
}

export interface ChampionMatchupChallenge extends ChampionMatchupRound {
  type: "champion-matchup";
  rounds?: ChampionMatchupRound[];
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
  championMatchup: ChampionMatchupChallenge;
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

export type DailyChallengeStaticResponse = Omit<DailyChallengeResponse, "stats">;

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
  rankTier: string;
  rankDivision: string | null;
  rankLp: number;
  lastLpChange: number | null;
  rankedGamesPlayed: number;
  rankedWins: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  currentRank: string;
  currentRankTier: string;
  currentRankDivision: string | null;
  currentRankLp: number;
  peakRank: string;
  peakRankTier: string;
  peakRankDivision: string | null;
  peakRankLp: number;
  currentStreak: number;
  maxStreak: number;
  gamesPlayed: number;
  winRate: number;
  fastestSolveMs: number | null;
  perfectSolves: number;
}
