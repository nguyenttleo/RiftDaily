"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthPanel } from "@/components/auth-panel";
import {
  ChampionMatchupGame,
  DodgeQueueGame,
  GuessEloGame,
  ItemBuildGame,
  ItemRecipeGame
} from "@/components/expanded-games";
import { LeaderboardPanel } from "@/components/leaderboard-panel";
import { NexusLoader } from "@/components/nexus-loader";
import { PromotionModal } from "@/components/promotion-modal";
import { TftPlayShell } from "@/components/tft-play-shell";
import {
  createInitialRankState,
  nextRankProgress,
  normalizeRankState,
  parseLeagueRankState,
  rankPromotionEventName,
  rankedStorageKey,
  type RankPromotionEventDetail,
  type LeagueRankState
} from "@/game/scoring";
import { BUILD_SHARE_PARAM } from "@/lib/build-share";
import { cn } from "@/lib/utils";
import { RiftCommandBar, type PlayMode, type PlayProduct } from "@/components/rift-command-bar";
import type { DailyChallengeStaticResponse, LeaderboardEntry, UserStats } from "@/types";

type View = PlayMode;
type Product = PlayProduct;

const defaultView: View = "item-build";
const defaultProduct: Product = "lol";
const lolViewModes = new Set<View>([
  "item-build",
  "item-recipe",
  "guess-elo",
  "champion-matchup",
  "dodge-queue",
  "leaderboard"
]);
const tftViewModes = new Set<View>(["tft-recipe", "tft-connections"]);
const DAILY_CLIENT_PAYLOAD_VERSION = "item-tooltips-v3";
const ROUND_SYNC_RETRY_DELAY_MS = 2500;
const ROUND_SYNC_MAX_BLOCKING_ATTEMPTS = 4;
type DailyRoundLimits = {
  itemBuild: number;
  guessElo: number;
  championMatchup: number;
  dodgeQueue: number;
};
type ExpandableRoundMode = keyof DailyRoundLimits;

const INITIAL_DAILY_ROUND_LIMITS: DailyRoundLimits = {
  itemBuild: 20,
  guessElo: 20,
  championMatchup: 60,
  dodgeQueue: 20
};
const EXPANDED_DAILY_ROUND_LIMITS: DailyRoundLimits = {
  itemBuild: 50,
  guessElo: 40,
  championMatchup: 120,
  dodgeQueue: 40
};

const guestStats: UserStats = {
  username: "Guest",
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

export function AppShell() {
  const initialRoute = initialPlayRoute();
  const [daily, setDaily] = useState<DailyChallengeStaticResponse | null>(null);
  const [stats, setStats] = useState<UserStats>(guestStats);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [product, setProduct] = useState<Product>(initialRoute.product);
  const [view, setView] = useState<View>(initialRoute.view);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [promotion, setPromotion] = useState<RankPromotionEventDetail | null>(null);
  const roundLimitsRef = useRef<DailyRoundLimits>(INITIAL_DAILY_ROUND_LIMITS);
  const viewRef = useRef<View>(initialRoute.view);

  const loadDaily = useCallback(async (options: { blocking?: boolean; recovery?: boolean; roundLimits?: DailyRoundLimits; view?: View } = {}) => {
    const shouldBlockForRounds = options.blocking ?? true;
    const roundLimits = options.roundLimits ?? roundLimitsRef.current;
    const blockingView = options.view ?? viewRef.current;

    setMessage("");
    if (shouldBlockForRounds) {
      setLoading(true);
    }
    setRefreshing(true);

    try {
      let nextDaily = await fetchDailyChallenge(roundLimits);
      let syncAttempts = 0;

      while (shouldBlockForRounds && hasRecoverableDataGapForView(nextDaily, blockingView) && syncAttempts < ROUND_SYNC_MAX_BLOCKING_ATTEMPTS) {
        syncAttempts += 1;
        await wait(ROUND_SYNC_RETRY_DELAY_MS);
        nextDaily = await fetchDailyChallenge(roundLimits);
      }

      if (shouldBlockForRounds && hasRecoverableDataGapForView(nextDaily, blockingView)) {
        throw new Error("Rounds are still syncing. Try again shortly.");
      }

      setDaily(nextDaily);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Daily load failed.");
      if (shouldBlockForRounds) {
        setDaily((current) => (current && hasRecoverableDataGapForView(current, blockingView) ? null : current));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const requestMoreRounds = useCallback((mode: ExpandableRoundMode) => {
    const currentLimits = roundLimitsRef.current;
    const expandedLimit = EXPANDED_DAILY_ROUND_LIMITS[mode];

    if (currentLimits[mode] >= expandedLimit) {
      return;
    }

    const nextLimits = {
      ...currentLimits,
      [mode]: expandedLimit
    };

    roundLimitsRef.current = nextLimits;
    void loadDaily({ blocking: false, recovery: true, roundLimits: nextLimits });
  }, [loadDaily]);

  const loadLeaderboard = useCallback(async () => {
    const response = await fetch("/api/leaderboard");

    if (response.ok) {
      const body = (await response.json()) as { entries: LeaderboardEntry[] };
      setLeaderboard(body.entries);
    }
  }, []);

  const loadStats = useCallback(async () => {
    const response = await fetch("/api/stats/me", { cache: "no-store" });

    if (response.ok) {
      const body = (await response.json()) as { stats: UserStats };
      setStats(body.stats);
    }
  }, []);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (product !== "lol") {
      setLoading(false);
      return;
    }

    void loadDaily({ view: viewRef.current });
    void loadStats();
    void loadLeaderboard();
  }, [loadDaily, loadLeaderboard, loadStats, product]);

  useEffect(() => {
    const syncViewFromUrl = () => {
      const nextRoute = routeStateFromSearch(window.location.search);

      setProduct(nextRoute.product);
      setView(nextRoute.view);
    };

    syncViewFromUrl();
    window.addEventListener("popstate", syncViewFromUrl);

    return () => {
      window.removeEventListener("popstate", syncViewFromUrl);
    };
  }, []);

  useEffect(() => {
    if (product !== "lol" || !daily || !hasRecoverableDataGapForView(daily, view) || refreshing) {
      return;
    }

    void loadDaily({ blocking: true, recovery: true, view });
  }, [daily, loadDaily, product, refreshing, view]);

  const resetCountdown = useResetCountdown(daily?.resetAt);
  const displayStats = useRankedStats(stats);
  const rankState = rankStateFromStats(displayStats);
  const rankProgress = nextRankProgress(rankState);
  const usesLeftRail = product === "lol" && (view === "item-build" || view === "item-recipe");
  const selectView = useCallback((nextView: View) => {
    const nextProduct = productForView(nextView) ?? product;

    setProduct(nextProduct);
    setView(nextView);
    replacePlayUrl(nextProduct, nextView);

    if (nextProduct === "lol" && daily && hasRecoverableDataGapForView(daily, nextView)) {
      void loadDaily({ blocking: true, recovery: true, view: nextView });
    }
  }, [daily, loadDaily, product]);
  const selectProduct = useCallback((nextProduct: Product) => {
    const nextView = defaultViewForProduct(nextProduct);

    setProduct(nextProduct);
    setView(nextView);
    replacePlayUrl(nextProduct, nextView);
  }, []);

  useEffect(() => {
    const syncStats = () => {
      void loadStats();
      void loadLeaderboard();
    };

    window.addEventListener(streakUpdateEventName, syncStats);
    return () => {
      window.removeEventListener(streakUpdateEventName, syncStats);
    };
  }, [loadLeaderboard, loadStats]);

  useEffect(() => {
    const handlePromotion = (event: Event) => {
      const detail = (event as CustomEvent<RankPromotionEventDetail>).detail;

      if (detail?.toRank) {
        setPromotion(detail);
      }
    };

    window.addEventListener(rankPromotionEventName, handlePromotion);
    return () => {
      window.removeEventListener(rankPromotionEventName, handlePromotion);
    };
  }, []);

  if (product === "tft") {
    return (
      <TftPlayShell
        view={asTftView(view)}
        onModeSelect={selectView}
        onProductSelect={selectProduct}
      />
    );
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center overflow-hidden bg-[var(--background)] px-4">
        <NexusLoader />
        {promotion && <PromotionModal key={`${promotion.toRank}:${promotion.lp}:${promotion.lpChange ?? 0}`} promotion={promotion} onClose={() => setPromotion(null)} />}
      </main>
    );
  }

  if (!daily) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4">
        <div className="rounded-xl border border-[rgba(224,98,108,.35)] bg-[rgba(224,98,108,.1)] px-5 py-4 text-sm font-medium text-[#ffd2d6]">{message || "Unable to load."}</div>
      </main>
    );
  }

  const compactLobbyLayout = view === "dodge-queue";

  return (
    <main className="grid min-h-dvh items-start overflow-x-clip bg-[var(--background)] lg:grid-cols-[minmax(0,1fr)_19rem]">
      <section
        className={cn(
          "grid min-h-dvh min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] transition-[grid-template-columns,gap] duration-300 ease-out",
          compactLobbyLayout ? "gap-0.5 p-0.5 sm:gap-1 sm:p-1" : "gap-2 p-2 sm:gap-3 sm:p-4",
          usesLeftRail
            ? "xl:grid-cols-[minmax(18rem,21rem)_minmax(0,1fr)] xl:grid-rows-[auto_minmax(0,1fr)] xl:items-start"
            : "lg:grid-rows-[auto_minmax(0,1fr)]"
        )}
      >
        <motion.div
          layout
          transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
          className={cn("min-w-0 transition-[grid-column,grid-row] duration-300 ease-out", usesLeftRail && "xl:col-start-2 xl:row-start-1")}
        >
          <RiftCommandBar
            activeMode={view}
            activeProduct="lol"
            brandVariant="sleek"
            compact={compactLobbyLayout}
            onModeSelect={selectView}
            onProductSelect={selectProduct}
            position="sticky"
            showCta={false}
            showProductSwitch
            className="transition-[box-shadow,filter] duration-200 ease-out"
          />
        </motion.div>

        <MobileHub
          daily={daily}
          view={view}
          resetCountdown={resetCountdown}
          stats={displayStats}
          rankProgress={rankProgress}
        />

        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className={cn(
            "min-h-0 overflow-visible",
            usesLeftRail ? "grid gap-2 sm:gap-3 xl:contents" : "lg:overflow-hidden"
          )}
        >

        {view === "item-build" && <ItemBuildGame challenge={daily.extraChallenges.itemBuild} items={daily.items} username={displayStats.username} pageRail onNeedMoreRounds={() => requestMoreRounds("itemBuild")} />}
        {view === "item-recipe" && <ItemRecipeGame challenge={daily.extraChallenges.itemRecipe} items={daily.items} username={displayStats.username} pageRail />}
        {view === "guess-elo" && <GuessEloGame challenge={daily.extraChallenges.guessElo} username={displayStats.username} onNeedMoreRounds={() => requestMoreRounds("guessElo")} />}
        {view === "champion-matchup" && <ChampionMatchupGame challenge={daily.extraChallenges.championMatchup} username={displayStats.username} onNeedMoreRounds={() => requestMoreRounds("championMatchup")} />}
        {view === "dodge-queue" && <DodgeQueueGame challenge={daily.extraChallenges.dodgeQueue} username={displayStats.username} onNeedMoreRounds={() => requestMoreRounds("dodgeQueue")} />}

        {view === "leaderboard" && <LeaderboardPanel entries={leaderboard} />}
        </motion.div>

        <div className="lg:hidden">
          <AuthPanel
            onAuthChange={() => {
              void loadStats();
              void loadLeaderboard();
            }}
          />
        </div>
      </section>

      <aside className="relative hidden h-[calc(100dvh-1rem)] self-start overflow-hidden border-l border-[var(--line)] bg-[linear-gradient(180deg,#0c0f16_0%,#08090e_60%,var(--background)_100%)] p-3 lg:sticky lg:top-2 lg:flex lg:flex-col lg:gap-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--gold)]/45 to-transparent" />
        <div className="relative">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-[var(--foreground)]">Stats</h1>
          <div className="mt-1 text-[11px] text-[color:var(--muted)]">Reset {formatReset(resetCountdown)} · Patch {daily.dataDragonVersion}</div>
        </div>
        <div className="relative flex min-h-0 flex-col gap-2 overflow-y-auto pr-1 pb-1 fine-scrollbar">
          <PlayerSidebarGroup stats={displayStats} progress={rankProgress} />
          <TodaySidebarGroup
            puzzleLabel={view === "leaderboard" ? "Leaderboard" : currentGameLabel(view)}
            resetCountdown={resetCountdown}
            leaderboard={leaderboard}
          />
          <AuthPanel
            onAuthChange={() => {
              void loadStats();
              void loadLeaderboard();
            }}
          />
        </div>
      </aside>
      {promotion && <PromotionModal key={`${promotion.toRank}:${promotion.lp}:${promotion.lpChange ?? 0}`} promotion={promotion} onClose={() => setPromotion(null)} />}
    </main>
  );
}

function MobileHub({
  daily,
  view,
  resetCountdown,
  stats,
  rankProgress
}: {
  daily: DailyChallengeStaticResponse;
  view: View;
  resetCountdown: string;
  stats: UserStats;
  rankProgress: ReturnType<typeof nextRankProgress>;
}) {
  return (
    <div className="lg:hidden">
      <HubCard accent>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{view === "leaderboard" ? "Leaderboard" : currentGameLabel(view)}</div>
              <div className="mt-0.5 text-[11px] text-[color:var(--muted)]">Reset {formatReset(resetCountdown)} · Patch {daily.dataDragonVersion}</div>
            </div>
            <span className="shrink-0 rounded-full border border-[var(--line-gold)] bg-[rgba(243,198,77,.1)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--gold)]">
              {stats.rank} · {stats.rankLp} LP
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 border-t border-white/8 pt-2">
            <MobileProgressStat label="Streak" value={String(stats.currentStreak)} />
            <MobileProgressStat label="Best" value={String(stats.maxStreak)} />
            <MobileProgressStat label="Win" value={`${stats.winRate}%`} />
            <MobileProgressStat label="LP" value={String(rankProgress.lp)} />
          </div>
        </div>
      </HubCard>
    </div>
  );
}

function MobileProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-display truncate text-lg font-bold leading-none">{value}</div>
      <div className="mt-0.5 truncate text-[9px] uppercase tracking-[0.06em] text-[color:var(--muted)]">{label}</div>
    </div>
  );
}

function HubCard({ title, children, accent = false }: { title?: string; children: ReactNode; accent?: boolean }) {
  return (
    <section
      className={cn(
        "relative shrink-0 overflow-hidden rounded-xl border bg-[var(--surface-1)] p-2.5 shadow-[var(--shadow-sm)]",
        accent ? "border-[var(--line-gold)]" : "border-[var(--line)]"
      )}
    >
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />
      {title && <div className="font-display text-xs font-bold uppercase tracking-[0.12em] text-[var(--gold)]">{title}</div>}
      {children}
    </section>
  );
}

function SidebarGroup({ title, children, accent = false }: { title: string; children: ReactNode; accent?: boolean }) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border bg-[var(--surface-1)] p-3 shadow-[var(--shadow-sm)]",
        accent ? "border-[var(--line-gold)]" : "border-[var(--line)]"
      )}
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--gold)]">{title}</div>
      <div className="mt-2.5 grid gap-3">{children}</div>
    </section>
  );
}

function PlayerSidebarGroup({ stats, progress }: { stats: UserStats; progress: ReturnType<typeof nextRankProgress> }) {
  const recordLine = stats.rankedGamesPlayed > 0 ? `${stats.rankedWins}W / ${stats.rankedGamesPlayed}G` : stats.gamesPlayed > 0 ? `${stats.wins}W / ${stats.gamesPlayed}G` : "No games yet";
  const roleLine = stats.favoriteRole !== "Unclaimed" ? stats.favoriteRole : "Role unclaimed";
  const lpDelta = progress.lastLpChange;

  return (
    <SidebarGroup title="Player" accent>
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 truncate text-base font-semibold text-white" title={stats.username}>{stats.username}</div>
          <span className="shrink-0 text-[11px] text-[color:var(--muted)]">{recordLine}</span>
        </div>
        {roleLine !== "Role unclaimed" && <div className="mt-1 truncate text-xs text-[color:var(--muted)]">{roleLine}</div>}
      </div>

      <div className="relative overflow-hidden border-t border-white/8 pt-3">
        <div className="grid min-w-0 items-center" style={{ gridTemplateColumns: stats.rankTier === "Unranked" ? "1fr" : "max-content minmax(5.5rem, 1fr)" }}>
          <div className="min-w-0">
            <div className="truncate font-display text-2xl font-black leading-none text-white" title={stats.rank}>
              {stats.rank}
            </div>
          </div>
          {stats.rankTier !== "Unranked" && (
            <div className="flex min-w-0 justify-end pr-2">
              <RankEmblem rankTier={stats.rankTier} />
            </div>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="font-display text-lg font-bold text-[var(--gold)]">{progress.lp} LP</div>
          {typeof lpDelta === "number" && (
            <div className={cn("text-xs font-bold", lpDelta >= 0 ? "text-green-300" : "text-red-300")}>
              {lpDelta > 0 ? "+" : ""}
              {lpDelta} LP
            </div>
          )}
          <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--muted)]">
            {progress.nextRank ? `to ${progress.nextRank}` : "Peak"}
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-1.5 rounded-full bg-[linear-gradient(90deg,var(--gold-deep),var(--gold))] transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="mt-1.5 text-[11px] text-[color:var(--muted)]">
          {stats.rank === "Unranked"
            ? "Play any mode to place into Iron IV."
            : progress.nextRank
              ? `Reach ${progress.nextPoints} LP to promote to ${progress.nextRank}`
              : "Peak rank unlocked"}
        </div>
      </div>

      <div className="border-t border-white/8 pt-3">
        <div className="grid grid-cols-4 gap-2">
          <ProgressStat label="Streak" value={String(stats.currentStreak)} />
          <ProgressStat label="Best" value={String(stats.maxStreak)} />
          <ProgressStat label="Winrate" value={`${stats.winRate}%`} />
          <ProgressStat label="Perfect" value={String(stats.perfectSolves)} />
        </div>
      </div>
    </SidebarGroup>
  );
}

function TodaySidebarGroup({
  puzzleLabel,
  resetCountdown,
  leaderboard
}: {
  puzzleLabel: string;
  resetCountdown: string;
  leaderboard: LeaderboardEntry[];
}) {
  const preview = leaderboard.slice(0, 3);

  return (
    <SidebarGroup title="Today">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-base font-semibold text-white">{puzzleLabel}</div>
        <div className="shrink-0 text-[11px] text-[color:var(--muted)]">{formatReset(resetCountdown)}</div>
      </div>

      <div className="border-t border-white/8 pt-3">
        <div className="grid gap-1.5">
          {preview.length > 0 ? (
            preview.map((entry) => (
              <div key={`${entry.rank}-${entry.username}:sidebar`} className="grid grid-cols-[1.35rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                <span className="font-display text-xs font-bold text-[var(--gold)]">#{entry.rank}</span>
                <span className="truncate font-semibold text-white" title={entry.username}>{entry.username}</span>
                <span className="text-xs text-[color:var(--muted)]">{entry.currentRank} - {entry.currentRankLp} LP</span>
              </div>
            ))
          ) : (
            <div className="text-sm text-[color:var(--muted)]">No solves yet.</div>
          )}
        </div>
      </div>
    </SidebarGroup>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-xl font-bold leading-none">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-[0.06em] text-[color:var(--muted)]">{label}</div>
    </div>
  );
}

const streakUpdateEventName = "rift-daily:streak-updated";
const localModeKeys = ["item-build", "item-recipe", "guess-elo", "champion-matchup", "dodge-queue", "tft-recipe", "tft-connections"] as const;

type LocalModeStreak = {
  current: number;
  best: number;
  played: number;
  wins?: number;
};

function useRankedStats(stats: UserStats): UserStats {
  const [rankedStats, setRankedStats] = useState<UserStats>(() => mergeStatsWithLocalStreaks(stats));

  const refresh = useCallback(() => {
    setRankedStats(mergeStatsWithLocalStreaks(stats));
  }, [stats]);

  useEffect(() => {
    refresh();

    window.addEventListener("storage", refresh);
    window.addEventListener(streakUpdateEventName, refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(streakUpdateEventName, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return rankedStats;
}

function mergeStatsWithLocalStreaks(stats: UserStats): UserStats {
  const serverRankState = rankStateFromStats(stats);

  if (typeof window === "undefined") {
    return {
      ...stats,
      rank: displayLocalRank(serverRankState),
      rankTier: serverRankState.tier,
      rankDivision: serverRankState.division,
      rankLp: serverRankState.lp,
      lastLpChange: serverRankState.lastLpChange,
      rankedGamesPlayed: serverRankState.gamesPlayed,
      rankedWins: serverRankState.wins
    };
  }

  if (!isGuestUsername(stats.username)) {
    return {
      ...stats,
      rank: displayLocalRank(serverRankState),
      rankTier: serverRankState.tier,
      rankDivision: serverRankState.division,
      rankLp: serverRankState.lp,
      lastLpChange: serverRankState.lastLpChange,
      rankedGamesPlayed: serverRankState.gamesPlayed,
      rankedWins: serverRankState.wins
    };
  }

  const localStreaks = readLocalModeStreaks(stats.username);
  const localPlayed = localStreaks.reduce((total, streak) => total + streak.played, 0);
  const localWins = localStreaks.reduce((total, streak) => total + Math.max(streak.wins ?? 0, streak.best, streak.current), 0);
  const gamesPlayed = stats.gamesPlayed + localPlayed;
  const wins = stats.wins + localWins;
  const currentStreak = Math.max(stats.currentStreak, ...localStreaks.map((streak) => streak.current));
  const maxStreak = Math.max(stats.maxStreak, ...localStreaks.map((streak) => streak.best));
  const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : stats.winRate;
  const merged = {
    ...stats,
    currentStreak,
    maxStreak,
    gamesPlayed,
    wins,
    winRate
  };
  const localRankState = parseLeagueRankState(window.localStorage.getItem(rankedStorageKey(stats.username))) ?? createInitialRankState(merged);

  return {
    ...merged,
    rank: displayLocalRank(localRankState),
    rankTier: localRankState.tier,
    rankDivision: localRankState.division,
    rankLp: localRankState.lp,
    lastLpChange: localRankState.lastLpChange,
    rankedGamesPlayed: localRankState.gamesPlayed,
    rankedWins: localRankState.wins
  };
}

function rankStateFromStats(stats: UserStats): LeagueRankState {
  return normalizeRankState({
    tier: stats.rankTier ?? stats.rank,
    division: stats.rankDivision,
    lp: stats.rankLp ?? 0,
    lastLpChange: stats.lastLpChange ?? null,
    gamesPlayed: stats.rankedGamesPlayed ?? stats.gamesPlayed,
    wins: stats.rankedWins ?? stats.wins
  });
}

function displayLocalRank(state: LeagueRankState) {
  if (state.tier === "Unranked") {
    return "Unranked";
  }

  return state.division ? `${state.tier} ${state.division}` : state.tier;
}

function RankEmblem({ rankTier }: { rankTier: string }) {
  return (
    <span className="relative -my-2 h-14 w-20 shrink-0 bg-transparent">
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-28 -translate-x-1/2 -translate-y-1/2 rounded-[999px] bg-[radial-gradient(ellipse_at_center,rgba(245,197,66,.11)_0%,rgba(245,197,66,.055)_38%,rgba(120,180,255,.025)_62%,transparent_82%)] blur-md" />
      <span className="absolute inset-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={rankEmblemUrl(rankTier)}
          alt=""
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none object-contain opacity-100 saturate-125"
          style={{ width: "28rem", maxWidth: "none", transform: "translate(-50%, -50%)" }}
        />
      </span>
    </span>
  );
}

function rankEmblemUrl(rankTier: string) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${rankTier.toLowerCase()}.png`;
}

function isGuestUsername(username: string) {
  return username.trim().toLowerCase() === "guest";
}

function readLocalModeStreaks(username: string): LocalModeStreak[] {
  const normalized = normalizeStorageKey(username || "guest");
  const keys = new Set<string>();

  for (const mode of localModeKeys) {
    keys.add(`rift-daily:${mode}:${normalized}`);
  }

  return [...keys]
    .map((key) => readLocalModeStreak(key))
    .filter((streak): streak is LocalModeStreak => Boolean(streak));
}

function readLocalModeStreak(key: string): LocalModeStreak | null {
  const raw = window.localStorage.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalModeStreak>;

    if (typeof parsed.current !== "number" || typeof parsed.best !== "number" || typeof parsed.played !== "number") {
      return null;
    }

    return {
      current: Math.max(0, parsed.current),
      best: Math.max(0, parsed.best),
      played: Math.max(0, parsed.played),
      wins: typeof parsed.wins === "number" ? Math.max(0, parsed.wins) : undefined
    };
  } catch {
    return null;
  }
}

function normalizeStorageKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function currentGameLabel(view: View) {
  const labels: Record<View, string> = {
    "item-build": "Item Build Puzzle",
    "item-recipe": "Item Recipe Puzzle",
    "guess-elo": "Guess the Elo",
    "champion-matchup": "Who Wins More?",
    "dodge-queue": "Dodge or Queue",
    leaderboard: "Leaderboard",
    "tft-recipe": "TFT Recipe",
    "tft-connections": "TFT Connections"
  };

  return labels[view];
}

function initialPlayRoute() {
  if (typeof window === "undefined") {
    return { product: defaultProduct, view: defaultView };
  }

  return routeStateFromSearch(window.location.search);
}

function routeStateFromSearch(search: string): { product: Product; view: View } {
  const params = new URLSearchParams(search);
  const mode = params.get("mode") as View | null;

  if (params.get(BUILD_SHARE_PARAM)) {
    return { product: "lol", view: "item-build" };
  }

  if (params.get("game") === "tft" || (mode && tftViewModes.has(mode))) {
    return {
      product: "tft",
      view: mode && tftViewModes.has(mode) ? mode : "tft-recipe"
    };
  }

  if (mode && lolViewModes.has(mode)) {
    return { product: "lol", view: mode };
  }

  return { product: defaultProduct, view: defaultView };
}

function defaultViewForProduct(product: Product): View {
  return product === "tft" ? "tft-recipe" : "item-build";
}

function productForView(view: View): Product | null {
  if (tftViewModes.has(view)) {
    return "tft";
  }

  if (lolViewModes.has(view)) {
    return "lol";
  }

  return null;
}

function asTftView(view: View): Extract<View, "tft-recipe" | "tft-connections"> {
  return tftViewModes.has(view) ? view as Extract<View, "tft-recipe" | "tft-connections"> : "tft-recipe";
}

function replacePlayUrl(product: Product, view: View) {
  const url = new URL(window.location.href);

  url.searchParams.set("mode", view);

  if (product === "tft") {
    url.searchParams.set("game", "tft");
    url.searchParams.delete(BUILD_SHARE_PARAM);
  } else {
    url.searchParams.delete("game");
    if (view !== "item-build") {
      url.searchParams.delete(BUILD_SHARE_PARAM);
    }
  }

  window.history.replaceState(null, "", url);
}

function currentBuildShareValue() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get(BUILD_SHARE_PARAM) ?? "";
}

async function fetchDailyChallenge(roundLimits: DailyRoundLimits = INITIAL_DAILY_ROUND_LIMITS): Promise<DailyChallengeStaticResponse> {
  const query = new URLSearchParams();
  const sharedBuild = currentBuildShareValue();

  if (sharedBuild) {
    query.set(BUILD_SHARE_PARAM, sharedBuild);
  }

  query.set("buildRounds", String(roundLimits.itemBuild));
  query.set("guessEloRounds", String(roundLimits.guessElo));
  query.set("matchupRounds", String(roundLimits.championMatchup));
  query.set("dodgeQueueRounds", String(roundLimits.dodgeQueue));
  query.set("payload", DAILY_CLIENT_PAYLOAD_VERSION);

  const response = await fetch(`/api/challenges/daily?${query.toString()}`);

  if (!response.ok) {
    throw new Error("Daily load failed.");
  }

  return (await response.json()) as DailyChallengeStaticResponse;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function hasRecoverableDataGapForView(daily: DailyChallengeStaticResponse, view: View) {
  if (view !== "item-build") {
    return false;
  }

  return !hasPlayableBuildChallenge(daily.extraChallenges.itemBuild);
}

function hasPlayableBuildChallenge(build: DailyChallengeStaticResponse["extraChallenges"]["itemBuild"]) {
  const rounds = build.rounds && build.rounds.length > 0 ? build.rounds : [build];

  return rounds.some(
    (round) =>
      !round.unavailableReason &&
      round.answerItemIds.length === 5 &&
      Boolean(round.answerBootsId) &&
      (round.allyTeam?.length ?? 0) === 5 &&
      (round.enemyPlayers?.length ?? 0) === 5
  );
}

function formatReset(value: string) {
  const [hours, minutes] = value.split(":");
  return `${Number(hours)}h ${Number(minutes)}m`;
}

function useResetCountdown(resetAt?: string): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!resetAt) {
    return "--:--";
  }

  const remaining = Math.max(0, new Date(resetAt).getTime() - now);
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining / (1000 * 60)) % 60);
  const seconds = Math.floor((remaining / 1000) % 60);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}
