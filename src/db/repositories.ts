import { champions } from "@/game/data/champions";
import {
  applyRankedResult,
  createInitialRankState,
  displayRankName,
  normalizeRankState,
  rankSortValue,
  rankFromProgress,
  type LeagueRankState
} from "@/game/scoring";
import { isDatabaseConfigured } from "@/lib/env";
import type { ChallengeType, LeaderboardEntry, UserStats } from "@/types";

import { query, withTransaction } from "./client";

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

interface StatsRow {
  current_streak: number | null;
  max_streak: number | null;
  games_played: number | null;
  wins: number | null;
  win_rate: string | number | null;
  perfect_solves: number | null;
  fastest_solve_ms: number | null;
  favorite_role: string | null;
  mode_current_streak?: number | null;
  mode_max_streak?: number | null;
  mode_games_played?: number | null;
  mode_wins?: number | null;
  rank_tier?: string | null;
  rank_division?: string | null;
  rank_lp?: number | null;
  rank_last_lp_change?: number | null;
  rank_games_played?: number | null;
  rank_wins?: number | null;
  peak_rank_tier?: string | null;
  peak_rank_division?: string | null;
  peak_rank_lp?: number | null;
}

interface ChallengeRow {
  id: string;
  date: string;
  challenge_type: ChallengeType;
  answer_id: string;
  seed: string;
  difficulty: string;
}

export interface EnsureChallengeInput {
  date: string;
  challengeType: ChallengeType;
  answerId: string;
  seed: string;
  difficulty: string;
  metadata?: Record<string, unknown>;
}

export interface RecordGuessInput {
  userId: string;
  challengeId: string;
  challengeType: ChallengeType;
  date: string;
  guess: Record<string, unknown>;
  correct: boolean;
  attemptNumber: number;
  elapsedMs: number;
  answerRoles: string[];
}

export interface CreateSuggestionInput {
  userId?: string | null;
  name?: string;
  contact?: string;
  type: string;
  message: string;
  page?: string;
}

export interface RecordRankedGameResultInput {
  userId: string;
  gameKey: string;
  roundId: string;
  won: boolean;
  performanceQuality: number;
  lpDelta?: number;
  metadata?: Record<string, unknown>;
}

export interface LocalModeProgressInput {
  gameKey: string;
  currentStreak: number;
  bestStreak: number;
  gamesPlayed: number;
  wins: number;
}

export interface ClaimLocalProgressInput {
  userId: string;
  claimId: string;
  modes: LocalModeProgressInput[];
  rankState?: LeagueRankState | null;
  payload?: Record<string, unknown>;
}

interface RankStateRow {
  tier: string | null;
  division: string | null;
  lp: number | null;
  last_lp_change: number | null;
  games_played: number | null;
  wins: number | null;
}

let rankSchemaReady = false;
let localProgressClaimSchemaReady = false;

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const result = await query<UserRow>("select * from users where lower(email) = lower($1) limit 1", [email]);
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const result = await query<UserRow>("select * from users where id = $1 limit 1", [id]);
  return result.rows[0] ?? null;
}

export async function createUser(input: { username: string; email: string; passwordHash: string }): Promise<UserRow> {
  const result = await query<UserRow>(
    `insert into users (username, email, password_hash)
     values ($1, $2, $3)
     returning *`,
    [input.username, input.email, input.passwordHash]
  );

  return result.rows[0];
}

export async function createSuggestion(input: CreateSuggestionInput): Promise<{ persisted: boolean }> {
  if (!isDatabaseConfigured()) {
    return { persisted: false };
  }

  await query(
    `insert into suggestions (user_id, name, contact, type, message, page)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.userId ?? null,
      input.name ?? null,
      input.contact ?? null,
      input.type,
      input.message,
      input.page ?? null
    ]
  );

  return { persisted: true };
}

export async function ensureDailyChallenge(input: EnsureChallengeInput): Promise<ChallengeRow | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const result = await query<ChallengeRow>(
    `insert into daily_challenges (date, challenge_type, answer_id, seed, difficulty, metadata)
     values ($1, $2, $3, $4, $5, $6::jsonb)
     on conflict (date, challenge_type)
     do update set
       answer_id = excluded.answer_id,
       seed = excluded.seed,
       difficulty = excluded.difficulty,
       metadata = excluded.metadata
     returning id::text, date::text, challenge_type, answer_id, seed, difficulty`,
    [
      input.date,
      input.challengeType,
      input.answerId,
      input.seed,
      input.difficulty,
      JSON.stringify(input.metadata ?? {})
    ]
  );

  return result.rows[0] ?? null;
}

export async function getDailyChallengeById(id: string): Promise<ChallengeRow | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const result = await query<ChallengeRow>(
    `select id::text, date::text, challenge_type, answer_id, seed, difficulty
     from daily_challenges
     where id::text = $1
     limit 1`,
    [id]
  );

  return result.rows[0] ?? null;
}

export async function getDailyChallengeByDateType(date: string, challengeType: ChallengeType): Promise<ChallengeRow | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const result = await query<ChallengeRow>(
    `select id::text, date::text, challenge_type, answer_id, seed, difficulty
     from daily_challenges
     where date = $1::date and challenge_type = $2
     limit 1`,
    [date, challengeType]
  );

  return result.rows[0] ?? null;
}

export async function getRecentAnswerIds(challengeType: ChallengeType, limit = 14): Promise<string[]> {
  if (!isDatabaseConfigured()) {
    return [];
  }

  const result = await query<{ answer_id: string }>(
    `select answer_id
     from daily_challenges
     where challenge_type = $1
     order by date desc
     limit $2`,
    [challengeType, limit]
  );

  return result.rows.map((row) => row.answer_id);
}

export async function recordGuess(input: RecordGuessInput): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }

  await query(
    `insert into guesses (user_id, challenge_id, guess, correct, attempt_number, elapsed_ms)
     values ($1, $2, $3::jsonb, $4, $5, $6)`,
    [input.userId, input.challengeId, JSON.stringify(input.guess), input.correct, input.attemptNumber, input.elapsedMs]
  );

  if (input.correct) {
    await query(
      `insert into challenge_results (
        user_id,
        challenge_id,
        challenge_type,
        date,
        solved,
        attempts,
        elapsed_ms,
        answer_roles,
        solved_at
      )
      values ($1, $2, $3, $4::date, true, $5, $6, $7, now())
      on conflict (user_id, challenge_id)
      do update set
        solved = true,
        attempts = least(challenge_results.attempts, excluded.attempts),
        elapsed_ms = least(challenge_results.elapsed_ms, excluded.elapsed_ms),
        answer_roles = excluded.answer_roles,
        solved_at = least(challenge_results.solved_at, excluded.solved_at)`,
      [
        input.userId,
        input.challengeId,
        input.challengeType,
        input.date,
        input.attemptNumber,
        input.elapsedMs,
        input.answerRoles
      ]
    );

    await recomputeUserStats(input.userId);
  }
}

export async function recordRankedGameResult(input: RecordRankedGameResultInput): Promise<{ rankState: LeagueRankState; lpDelta: number } | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  await ensureRankSchema();

  return withTransaction(async (client) => {
    const rankResult = await client.query<RankStateRow>(
      `select tier, division, lp, last_lp_change, games_played, wins
       from user_rank_state
       where user_id = $1
       for update`,
      [input.userId]
    );
    const before = rankStateFromRow(rankResult.rows[0]);
    const after = applyRankedResult(before, {
      won: input.won,
      performanceQuality: input.performanceQuality,
      lpDelta: input.lpDelta
    });
    const lpDelta = after.lastLpChange ?? 0;

    await client.query(
      `insert into user_rank_state (user_id, tier, division, lp, last_lp_change, games_played, wins, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (user_id)
       do update set
         tier = excluded.tier,
         division = excluded.division,
         lp = excluded.lp,
         last_lp_change = excluded.last_lp_change,
         games_played = excluded.games_played,
         wins = excluded.wins,
         updated_at = now()`,
      [input.userId, after.tier, after.division, after.lp, lpDelta, after.gamesPlayed, after.wins]
    );

    await client.query(
      `insert into ranked_game_results (
        user_id,
        game_key,
        round_id,
        won,
        performance_quality,
        lp_delta,
        tier_before,
        division_before,
        lp_before,
        tier_after,
        division_after,
        lp_after,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
      [
        input.userId,
        input.gameKey,
        input.roundId,
        input.won,
        Math.max(0, Math.min(1, input.performanceQuality)),
        lpDelta,
        before.tier,
        before.division,
        before.lp,
        after.tier,
        after.division,
        after.lp,
        JSON.stringify(input.metadata ?? {})
      ]
    );

    await client.query(
      `insert into game_mode_stats (user_id, game_key, current_streak, best_streak, games_played, wins, updated_at)
       values ($1, $2, case when $3 then 1 else 0 end, case when $3 then 1 else 0 end, 1, case when $3 then 1 else 0 end, now())
       on conflict (user_id, game_key)
       do update set
         current_streak = case when $3 then game_mode_stats.current_streak + 1 else 0 end,
         best_streak = greatest(game_mode_stats.best_streak, case when $3 then game_mode_stats.current_streak + 1 else 0 end),
         games_played = game_mode_stats.games_played + 1,
         wins = game_mode_stats.wins + case when $3 then 1 else 0 end,
         updated_at = now()`,
      [input.userId, input.gameKey, input.won]
    );

    return { rankState: after, lpDelta };
  });
}

export async function claimLocalProgress(input: ClaimLocalProgressInput): Promise<{ persisted: boolean; claimed: boolean }> {
  if (!isDatabaseConfigured()) {
    return { persisted: false, claimed: false };
  }

  const modes = input.modes.map(normalizeLocalModeProgress).filter((mode) => mode.gamesPlayed > 0 || mode.bestStreak > 0 || mode.currentStreak > 0);
  const rankState = input.rankState ? normalizeRankState(input.rankState) : null;
  const hasRankProgress = Boolean(rankState && (rankState.gamesPlayed > 0 || rankState.tier !== "Unranked" || rankState.lp > 0));

  if (modes.length === 0 && !hasRankProgress) {
    return { persisted: true, claimed: false };
  }

  await ensureRankSchema();
  await ensureLocalProgressClaimSchema();

  return withTransaction(async (client) => {
    const claim = await client.query<{ claim_id: string }>(
      `insert into local_progress_claims (user_id, claim_id, payload)
       values ($1, $2, $3::jsonb)
       on conflict (user_id, claim_id) do nothing
       returning claim_id`,
      [input.userId, input.claimId, JSON.stringify(input.payload ?? {})]
    );

    if (claim.rows.length === 0) {
      return { persisted: true, claimed: false };
    }

    for (const mode of modes) {
      await client.query(
        `insert into game_mode_stats (user_id, game_key, current_streak, best_streak, games_played, wins, updated_at)
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (user_id, game_key)
         do update set
           current_streak = greatest(game_mode_stats.current_streak, excluded.current_streak),
           best_streak = greatest(game_mode_stats.best_streak, excluded.best_streak, excluded.current_streak),
           games_played = game_mode_stats.games_played + excluded.games_played,
           wins = game_mode_stats.wins + excluded.wins,
           updated_at = now()`,
        [input.userId, mode.gameKey, mode.currentStreak, mode.bestStreak, mode.gamesPlayed, mode.wins]
      );
    }

    if (hasRankProgress && rankState) {
      const rankResult = await client.query<RankStateRow>(
        `select tier, division, lp, last_lp_change, games_played, wins
         from user_rank_state
         where user_id = $1
         for update`,
        [input.userId]
      );
      const existing = rankStateFromRow(rankResult.rows[0]);
      const stronger = rankSortValue(rankState) >= rankSortValue(existing) ? rankState : existing;
      const merged: LeagueRankState = normalizeRankState({
        ...stronger,
        gamesPlayed: existing.gamesPlayed + rankState.gamesPlayed,
        wins: existing.wins + rankState.wins,
        lastLpChange: stronger.lastLpChange ?? rankState.lastLpChange ?? existing.lastLpChange
      });

      await client.query(
        `insert into user_rank_state (user_id, tier, division, lp, last_lp_change, games_played, wins, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, now())
         on conflict (user_id)
         do update set
           tier = excluded.tier,
           division = excluded.division,
           lp = excluded.lp,
           last_lp_change = excluded.last_lp_change,
           games_played = excluded.games_played,
           wins = excluded.wins,
           updated_at = now()`,
        [input.userId, merged.tier, merged.division, merged.lp, merged.lastLpChange, merged.gamesPlayed, merged.wins]
      );
    }

    return { persisted: true, claimed: true };
  });
}

export async function getUserStats(userId?: string | null, username = "Guest"): Promise<UserStats> {
  if (!isDatabaseConfigured() || !userId) {
    return {
      username,
      currentStreak: 0,
      maxStreak: 0,
      gamesPlayed: 0,
      wins: 0,
      winRate: 0,
      perfectSolves: 0,
      fastestSolveMs: null,
      favoriteRole: "Unclaimed",
      rank: "Unranked",
      rankTier: "Unranked",
      rankDivision: null,
      rankLp: 0,
      lastLpChange: null,
      rankedGamesPlayed: 0,
      rankedWins: 0
    };
  }

  await ensureRankSchema();

  const result = await query<StatsRow & { username: string }>(
    `select
        u.username,
        coalesce(s.current_streak, 0) as current_streak,
        coalesce(s.max_streak, 0) as max_streak,
        coalesce(s.games_played, 0) as games_played,
        coalesce(s.wins, 0) as wins,
        coalesce(s.win_rate, 0) as win_rate,
        coalesce(s.perfect_solves, 0) as perfect_solves,
        s.fastest_solve_ms,
        coalesce(s.favorite_role, 'Unclaimed') as favorite_role,
        coalesce(ms.current_streak, 0) as mode_current_streak,
        coalesce(ms.max_streak, 0) as mode_max_streak,
        coalesce(ms.games_played, 0) as mode_games_played,
        coalesce(ms.wins, 0) as mode_wins,
        r.tier as rank_tier,
        r.division as rank_division,
        coalesce(r.lp, 0) as rank_lp,
        r.last_lp_change as rank_last_lp_change,
        coalesce(r.games_played, 0) as rank_games_played,
        coalesce(r.wins, 0) as rank_wins
      from users u
      left join user_stats s on s.user_id = u.id
      left join (
        select
          user_id,
          max(current_streak) as current_streak,
          max(best_streak) as max_streak,
          sum(games_played) as games_played,
          sum(wins) as wins
        from game_mode_stats
        where user_id = $1
        group by user_id
      ) ms on ms.user_id = u.id
      left join user_rank_state r on r.user_id = u.id
      where u.id = $1
      limit 1`,
    [userId]
  );

  const row = result.rows[0];

  if (!row) {
    return getUserStats(null, username);
  }

  return normalizeStatsRow(row.username, row);
}

export async function getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  if (!isDatabaseConfigured()) {
    return [];
  }

  await ensureRankSchema();

  const result = await query<StatsRow & { username: string }>(
    `with mode_stats as (
       select
         user_id,
         max(current_streak) as current_streak,
         max(best_streak) as max_streak,
         sum(games_played) as games_played,
         sum(wins) as wins
       from game_mode_stats
       group by user_id
     ),
     rank_candidates as (
       select user_id, tier, division, lp
       from user_rank_state
       union all
       select user_id, tier_before as tier, division_before as division, lp_before as lp
       from ranked_game_results
       union all
       select user_id, tier_after as tier, division_after as division, lp_after as lp
       from ranked_game_results
     ),
     peak_rank as (
       select user_id, tier, division, lp
       from (
         select
           user_id,
           tier,
           division,
           lp,
           row_number() over (
             partition by user_id
             order by
               (
                 case
                   when tier = 'Iron' then 1 + case division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
                   when tier = 'Bronze' then 5 + case division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
                   when tier = 'Silver' then 9 + case division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
                   when tier = 'Gold' then 13 + case division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
                   when tier = 'Platinum' then 17 + case division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
                   when tier = 'Emerald' then 21 + case division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
                   when tier = 'Diamond' then 25 + case division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
                   when tier = 'Master' then 29
                   when tier = 'Grandmaster' then 30
                   when tier = 'Challenger' then 31
                   else 0
                 end
               ) * 10000 + coalesce(lp, 0) desc,
               coalesce(lp, 0) desc
           ) as peak_order
         from rank_candidates
       ) ranked
       where peak_order = 1
     )
     select
        u.username,
        coalesce(s.current_streak, 0) as current_streak,
        coalesce(s.max_streak, 0) as max_streak,
        coalesce(s.games_played, 0) as games_played,
        coalesce(s.wins, 0) as wins,
        coalesce(s.win_rate, 0) as win_rate,
        coalesce(s.perfect_solves, 0) as perfect_solves,
        s.fastest_solve_ms,
        coalesce(s.favorite_role, 'Unclaimed') as favorite_role,
        coalesce(ms.current_streak, 0) as mode_current_streak,
        coalesce(ms.max_streak, 0) as mode_max_streak,
        coalesce(ms.games_played, 0) as mode_games_played,
        coalesce(ms.wins, 0) as mode_wins,
        coalesce(r.tier, 'Unranked') as rank_tier,
        r.division as rank_division,
        coalesce(r.lp, 0) as rank_lp,
        r.last_lp_change as rank_last_lp_change,
        coalesce(r.games_played, 0) as rank_games_played,
        coalesce(r.wins, 0) as rank_wins,
        (
          case
            when r.tier = 'Iron' then 1 + case r.division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
            when r.tier = 'Bronze' then 5 + case r.division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
            when r.tier = 'Silver' then 9 + case r.division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
            when r.tier = 'Gold' then 13 + case r.division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
            when r.tier = 'Platinum' then 17 + case r.division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
            when r.tier = 'Emerald' then 21 + case r.division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
            when r.tier = 'Diamond' then 25 + case r.division when 'IV' then 0 when 'III' then 1 when 'II' then 2 when 'I' then 3 else 0 end
            when r.tier = 'Master' then 29
            when r.tier = 'Grandmaster' then 30
            when r.tier = 'Challenger' then 31
            else 0
          end
        ) * 10000 + coalesce(r.lp, 0) as current_rank_score,
        p.tier as peak_rank_tier,
        p.division as peak_rank_division,
        p.lp as peak_rank_lp
      from users u
      left join user_stats s on s.user_id = u.id
      left join mode_stats ms on ms.user_id = u.id
      left join user_rank_state r on r.user_id = u.id
      left join peak_rank p on p.user_id = u.id
      where coalesce(s.games_played, 0) + coalesce(ms.games_played, 0) > 0
      order by current_rank_score desc,
               greatest(coalesce(s.current_streak, 0), coalesce(ms.current_streak, 0)) desc,
               greatest(coalesce(s.max_streak, 0), coalesce(ms.max_streak, 0)) desc,
               coalesce(s.perfect_solves, 0) desc,
               case
                 when coalesce(s.games_played, 0) + coalesce(ms.games_played, 0) > 0
                 then (coalesce(s.wins, 0) + coalesce(ms.wins, 0))::numeric / (coalesce(s.games_played, 0) + coalesce(ms.games_played, 0))
                 else 0
               end desc,
               s.fastest_solve_ms asc nulls last,
               u.username asc
      limit $1`,
    [Math.max(1, Math.min(50, Math.round(limit)))]
  );

  return result.rows.map((row, index) => {
    const stats = normalizeStatsRow(row.username, row);
    const peakRankState = normalizeRankState({
      tier: row.peak_rank_tier ?? stats.rankTier,
      division: row.peak_rank_division,
      lp: row.peak_rank_lp ?? stats.rankLp
    });

    return {
      rank: index + 1,
      username: stats.username,
      currentRank: stats.rank,
      currentRankTier: stats.rankTier,
      currentRankDivision: stats.rankDivision,
      currentRankLp: stats.rankLp,
      peakRank: displayRankName(peakRankState),
      peakRankTier: peakRankState.tier,
      peakRankDivision: peakRankState.division,
      peakRankLp: peakRankState.lp,
      currentStreak: stats.currentStreak,
      maxStreak: stats.maxStreak,
      gamesPlayed: stats.gamesPlayed,
      winRate: stats.winRate,
      fastestSolveMs: stats.fastestSolveMs,
      perfectSolves: stats.perfectSolves
    };
  });
}

async function recomputeUserStats(userId: string): Promise<void> {
  const gamesStartedResult = await query<{ games_played: string }>(
    "select count(distinct challenge_id)::text as games_played from guesses where user_id = $1",
    [userId]
  );
  const solvedResult = await query<{
    date: string;
    attempts: number;
    elapsed_ms: number;
    answer_roles: string[];
  }>(
    `select date::text, attempts, elapsed_ms, answer_roles
     from challenge_results
     where user_id = $1 and solved = true
     order by date asc`,
    [userId]
  );

  const gamesPlayed = Number(gamesStartedResult.rows[0]?.games_played ?? 0);
  const solvedRows = solvedResult.rows;
  const wins = solvedRows.length;
  const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
  const dates = [...new Set(solvedRows.map((row) => row.date))].sort();
  const currentStreak = calculateCurrentStreak(dates);
  const maxStreak = calculateMaxStreak(dates);
  const perfectSolves = solvedRows.filter((row) => row.attempts === 1).length;
  const fastestSolveMs = solvedRows.reduce<number | null>((fastest, row) => {
    if (fastest === null) {
      return row.elapsed_ms;
    }

    return Math.min(fastest, row.elapsed_ms);
  }, null);
  const favoriteRole = favoriteRoleFromResults(solvedRows.map((row) => row.answer_roles));

  await query(
    `insert into user_stats (
        user_id,
        current_streak,
        max_streak,
        games_played,
        wins,
        win_rate,
        perfect_solves,
        fastest_solve_ms,
        favorite_role,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      on conflict (user_id)
      do update set
        current_streak = excluded.current_streak,
        max_streak = greatest(user_stats.max_streak, excluded.max_streak),
        games_played = excluded.games_played,
        wins = excluded.wins,
        win_rate = excluded.win_rate,
        perfect_solves = excluded.perfect_solves,
        fastest_solve_ms = excluded.fastest_solve_ms,
        favorite_role = excluded.favorite_role,
        updated_at = now()`,
    [userId, currentStreak, maxStreak, gamesPlayed, wins, winRate, perfectSolves, fastestSolveMs, favoriteRole]
  );
}

function normalizeStatsRow(username: string, row: StatsRow): UserStats {
  const currentStreak = Math.max(Number(row.current_streak ?? 0), Number(row.mode_current_streak ?? 0));
  const maxStreak = Math.max(Number(row.max_streak ?? 0), Number(row.mode_max_streak ?? 0));
  const gamesPlayed = Number(row.games_played ?? 0) + Number(row.mode_games_played ?? 0);
  const wins = Number(row.wins ?? 0) + Number(row.mode_wins ?? 0);
  const perfectSolves = Number(row.perfect_solves ?? 0);
  const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : Number(row.win_rate ?? 0);
  const rankState = normalizeRankState({
    tier: row.rank_tier ?? rankFromProgress({ currentStreak, maxStreak, gamesPlayed, winRate, perfectSolves }),
    division: row.rank_division,
    lp: row.rank_lp ?? 0,
    lastLpChange: row.rank_last_lp_change,
    gamesPlayed: row.rank_games_played ?? gamesPlayed,
    wins: row.rank_wins ?? wins
  });

  return {
    username,
    currentStreak,
    maxStreak,
    gamesPlayed,
    wins,
    winRate,
    perfectSolves,
    fastestSolveMs: row.fastest_solve_ms,
    favoriteRole: row.favorite_role ?? "Unclaimed",
    rank: displayRankName(rankState),
    rankTier: rankState.tier,
    rankDivision: rankState.division,
    rankLp: rankState.lp,
    lastLpChange: rankState.lastLpChange,
    rankedGamesPlayed: rankState.gamesPlayed,
    rankedWins: rankState.wins
  };
}

async function ensureRankSchema(): Promise<void> {
  if (rankSchemaReady || !isDatabaseConfigured()) {
    return;
  }

  await query(
    `create table if not exists user_rank_state (
      user_id uuid primary key references users(id) on delete cascade,
      tier text not null default 'Unranked' check (tier in ('Unranked', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger')),
      division text,
      lp integer not null default 0 check (lp >= 0),
      last_lp_change integer,
      games_played integer not null default 0,
      wins integer not null default 0,
      updated_at timestamptz not null default now()
    )`
  );
  await query("alter table user_rank_state add column if not exists division text");
  await query("alter table user_rank_state drop constraint if exists user_rank_state_lp_check");
  await query("alter table user_rank_state add constraint user_rank_state_lp_check check (lp >= 0)");
  await query(
    `update user_rank_state
     set division = case
       when tier in ('Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond') and (division is null or division not in ('IV', 'III', 'II', 'I')) then 'IV'
       when tier in ('Unranked', 'Master', 'Grandmaster', 'Challenger') then null
       else division
     end
     where
       (tier in ('Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond') and (division is null or division not in ('IV', 'III', 'II', 'I')))
       or
       (tier in ('Unranked', 'Master', 'Grandmaster', 'Challenger') and division is not null)`
  );
  await query("alter table user_rank_state drop constraint if exists user_rank_state_division_check");
  await query(
    `alter table user_rank_state
     add constraint user_rank_state_division_check check (
       (tier in ('Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond') and division in ('IV', 'III', 'II', 'I'))
       or
       (tier in ('Unranked', 'Master', 'Grandmaster', 'Challenger') and division is null)
     )`
  );
  await query(
    `create table if not exists ranked_game_results (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      game_key text not null,
      round_id text not null,
      won boolean not null,
      performance_quality numeric(4, 3) not null,
      lp_delta integer not null check (lp_delta between -30 and 30 and lp_delta <> 0),
      tier_before text not null,
      division_before text,
      lp_before integer not null,
      tier_after text not null,
      division_after text,
      lp_after integer not null,
      metadata jsonb not null default '{}',
      created_at timestamptz not null default now()
    )`
  );
  await query("alter table ranked_game_results add column if not exists division_before text");
  await query("alter table ranked_game_results add column if not exists division_after text");
  await query(
    `create table if not exists game_mode_stats (
      user_id uuid not null references users(id) on delete cascade,
      game_key text not null,
      current_streak integer not null default 0,
      best_streak integer not null default 0,
      games_played integer not null default 0,
      wins integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (user_id, game_key)
    )`
  );
  await query("create index if not exists ranked_game_results_user_created_idx on ranked_game_results (user_id, created_at desc)");
  await query("create index if not exists ranked_game_results_game_created_idx on ranked_game_results (game_key, created_at desc)");
  await query("create index if not exists game_mode_stats_game_idx on game_mode_stats (game_key)");

  rankSchemaReady = true;
}

async function ensureLocalProgressClaimSchema(): Promise<void> {
  if (localProgressClaimSchemaReady || !isDatabaseConfigured()) {
    return;
  }

  await query(
    `create table if not exists local_progress_claims (
      user_id uuid not null references users(id) on delete cascade,
      claim_id text not null,
      payload jsonb not null default '{}',
      created_at timestamptz not null default now(),
      primary key (user_id, claim_id)
    )`
  );
  await query("create index if not exists local_progress_claims_created_idx on local_progress_claims (created_at desc)");

  localProgressClaimSchemaReady = true;
}

function rankStateFromRow(row?: RankStateRow): LeagueRankState {
  if (!row) {
    return createInitialRankState();
  }

  return normalizeRankState({
    tier: row.tier ?? "Unranked",
    division: row.division,
    lp: row.lp ?? 0,
    lastLpChange: row.last_lp_change,
    gamesPlayed: row.games_played ?? 0,
    wins: row.wins ?? 0
  });
}

function normalizeLocalModeProgress(mode: LocalModeProgressInput): LocalModeProgressInput {
  const gamesPlayed = Math.max(0, Math.round(Number(mode.gamesPlayed ?? 0)));
  const wins = Math.max(0, Math.min(gamesPlayed, Math.round(Number(mode.wins ?? 0))));
  const currentStreak = Math.max(0, Math.round(Number(mode.currentStreak ?? 0)));
  const bestStreak = Math.max(currentStreak, Math.round(Number(mode.bestStreak ?? 0)));

  return {
    gameKey: String(mode.gameKey).slice(0, 64),
    currentStreak,
    bestStreak,
    gamesPlayed,
    wins
  };
}

function calculateCurrentStreak(sortedDateKeys: string[]): number {
  if (sortedDateKeys.length === 0) {
    return 0;
  }

  const dateSet = new Set(sortedDateKeys);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = addDays(todayKey, -1);
  let cursor = dateSet.has(todayKey) ? todayKey : dateSet.has(yesterday) ? yesterday : "";

  if (!cursor) {
    return 0;
  }

  let streak = 0;

  while (dateSet.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function calculateMaxStreak(sortedDateKeys: string[]): number {
  let max = 0;
  let current = 0;
  let previous: string | null = null;

  for (const dateKey of sortedDateKeys) {
    current = previous && addDays(previous, 1) === dateKey ? current + 1 : 1;
    max = Math.max(max, current);
    previous = dateKey;
  }

  return max;
}

function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function favoriteRoleFromResults(roleLists: string[][]): string {
  const counts = new Map<string, number>();

  for (const roleList of roleLists) {
    for (const role of roleList) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unclaimed";
}

export function roleForAnswer(answerId: string): string[] {
  const championId = answerId.includes(":") ? answerId.split(":")[0] : answerId;
  return champions.find((champion) => champion.id === championId)?.roles ?? [];
}
