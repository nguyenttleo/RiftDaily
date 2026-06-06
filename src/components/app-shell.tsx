"use client";

import { motion } from "framer-motion";
import {
  CircleSlash,
  Clock3,
  Crosshair,
  Home,
  Loader2,
  PackageSearch,
  RefreshCcw,
  Split,
  Swords,
  Trophy,
  UsersRound,
  Zap
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { AuthPanel } from "@/components/auth-panel";
import {
  ChampionMatchupGame,
  DodgeQueueGame,
  GuessEloGame,
  ItemBuildGame,
  ItemRecipeGame
} from "@/components/expanded-games";
import { LeaderboardPanel } from "@/components/leaderboard-panel";
import { TrainerPage } from "@/components/trainer-page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DailyChallengeResponse, LeaderboardEntry } from "@/types";

type View =
  | "item-build"
  | "item-recipe"
  | "guess-elo"
  | "champion-matchup"
  | "dodge-queue"
  | "trainer"
  | "leaderboard";

export function AppShell() {
  const [daily, setDaily] = useState<DailyChallengeResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [view, setView] = useState<View>("item-build");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataRecoveryAttempts, setDataRecoveryAttempts] = useState(0);
  const [message, setMessage] = useState("");

  const loadDaily = useCallback(async (options: { recovery?: boolean } = {}) => {
    setMessage("");
    if (!options.recovery) {
      setDataRecoveryAttempts(0);
    }
    setRefreshing(true);

    try {
      const response = await fetch(`/api/challenges/daily?t=${Date.now()}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Daily load failed.");
      }

      const nextDaily = (await response.json()) as DailyChallengeResponse;
      setDaily(nextDaily);

      if (!hasRecoverableDataGap(nextDaily)) {
        setDataRecoveryAttempts(0);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Daily load failed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    const response = await fetch("/api/leaderboard", { cache: "no-store" });

    if (response.ok) {
      const body = (await response.json()) as { entries: LeaderboardEntry[] };
      setLeaderboard(body.entries);
    }
  }, []);

  const loadStats = useCallback(async () => {
    const response = await fetch("/api/stats/me", { cache: "no-store" });

    if (response.ok) {
      const body = (await response.json()) as Pick<DailyChallengeResponse, "stats">;
      setDaily((current) => (current ? { ...current, stats: body.stats } : current));
    }
  }, []);

  useEffect(() => {
    void loadDaily();
    void loadLeaderboard();
  }, [loadDaily, loadLeaderboard]);

  useEffect(() => {
    if (!daily || !hasRecoverableDataGapForView(daily, view) || dataRecoveryAttempts >= 4 || refreshing) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setDataRecoveryAttempts((current) => current + 1);
      void loadDaily({ recovery: true });
    }, 3500 + dataRecoveryAttempts * 1500);

    return () => window.clearTimeout(timeout);
  }, [daily, dataRecoveryAttempts, loadDaily, refreshing, view]);

  const resetCountdown = useResetCountdown(daily?.resetAt);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="flex items-center gap-3 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] p-4 text-[color:var(--muted)]">
          <Loader2 className="animate-spin" size={18} />
          Loading Rift Daily
        </div>
      </main>
    );
  }

  if (!daily) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="rounded-md border border-red-400/30 bg-red-500/12 p-4 text-red-100">{message || "Unable to load."}</div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen bg-[#050607] lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="grid min-h-screen grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 sm:p-4">
        <nav className="flex min-h-14 flex-nowrap items-center gap-2 overflow-x-auto rounded-md border border-[color:var(--line)] bg-[#080a0d]/95 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] fine-scrollbar">
          <Link
            href="/"
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-sm border border-[#2b2f38] bg-[#111722] px-3.5 text-sm font-semibold text-[#8c95a3] transition hover:border-[#c89b3c] hover:text-[color:var(--foreground)]"
          >
            <Home size={16} />
            Home
          </Link>
          <TabButton active={view === "item-build"} onClick={() => setView("item-build")} icon={<PackageSearch size={16} />} label="Build" />
          <TabButton active={view === "item-recipe"} onClick={() => setView("item-recipe")} icon={<Split size={16} />} label="Recipe" />
          <TabButton active={view === "guess-elo"} onClick={() => setView("guess-elo")} icon={<UsersRound size={16} />} label="Elo" />
          <TabButton active={view === "champion-matchup"} onClick={() => setView("champion-matchup")} icon={<Swords size={16} />} label="Matchup" />
          <TabButton active={view === "dodge-queue"} onClick={() => setView("dodge-queue")} icon={<CircleSlash size={16} />} label="Lobby" />
          <TabButton active={view === "trainer"} onClick={() => setView("trainer")} icon={<Crosshair size={16} />} label="Trainer" />
          <TabButton active={view === "leaderboard"} onClick={() => setView("leaderboard")} icon={<Trophy size={16} />} label="Leaderboard" />
          <Button
            type="button"
            variant="ghost"
            className="ml-auto min-h-10 shrink-0 px-3.5"
            onClick={() => {
              setDataRecoveryAttempts(0);
              void loadDaily();
              void loadLeaderboard();
            }}
            title="Refresh"
            icon={<RefreshCcw size={16} />}
            disabled={refreshing}
          >
            {refreshing ? "Syncing" : "Refresh"}
          </Button>
        </nav>

        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className={cn("min-h-0", view === "item-build" || view === "item-recipe" ? "overflow-visible" : "overflow-hidden")}
        >

        {view === "item-build" && <ItemBuildGame challenge={daily.extraChallenges.itemBuild} champions={daily.champions} items={daily.items} username={daily.stats.username} />}
        {view === "item-recipe" && <ItemRecipeGame challenge={daily.extraChallenges.itemRecipe} items={daily.items} username={daily.stats.username} />}
        {view === "guess-elo" && <GuessEloGame challenge={daily.extraChallenges.guessElo} username={daily.stats.username} />}
        {view === "champion-matchup" && <ChampionMatchupGame challenge={daily.extraChallenges.championMatchup} username={daily.stats.username} />}
        {view === "dodge-queue" && <DodgeQueueGame challenge={daily.extraChallenges.dodgeQueue} username={daily.stats.username} />}
        {view === "trainer" && <TrainerPage dodge={daily.extraChallenges.skillshotDodge} username={daily.stats.username} />}

        {view === "leaderboard" && <LeaderboardPanel entries={leaderboard} />}
        </motion.div>
      </section>

      <aside className="relative hidden h-screen overflow-hidden border-l border-[#c89b3c]/20 bg-[radial-gradient(circle_at_20%_0%,rgba(200,155,60,.16),transparent_28%),linear-gradient(180deg,#101620_0%,#070a0f_48%,#050607_100%)] p-4 shadow-[-28px_0_90px_rgba(0,0,0,.45)] lg:sticky lg:top-0 lg:grid lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f5c542]/60 to-transparent" />
        <div className="relative">
          <h1 className="font-display text-3xl font-black tracking-normal text-[color:var(--gold-bright)] drop-shadow-[0_0_18px_rgba(245,197,66,.18)]">Rift Daily</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">Daily League mechanics puzzle</p>
          <div className="mt-4 grid gap-1.5 text-xs text-[color:var(--muted)]">
            <span className="inline-flex items-center gap-2"><Clock3 size={14} /> Resets in {formatReset(resetCountdown)}</span>
            <span className="inline-flex items-center gap-2"><Zap size={14} /> Patch {daily.dataDragonVersion}</span>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-col gap-3 overflow-y-auto pr-1 pb-1 fine-scrollbar">
          <TodayPuzzleCard label={view === "leaderboard" ? "Leaderboard" : currentGameLabel(view)} dataState={dataStateForView(daily, view, refreshing, dataRecoveryAttempts)} />
          <DailyProgressCard stats={daily.stats} />
          <RankCard rank={daily.stats.rank} />
          <LeaderboardPreview entries={leaderboard} />
          <ProfileHub username={daily.stats.username} favoriteRole={daily.stats.favoriteRole} gamesPlayed={daily.stats.gamesPlayed} wins={daily.stats.wins} />
        </div>
        <AuthPanel
          onAuthChange={() => {
            void loadDaily();
            void loadStats();
            void loadLeaderboard();
          }}
        />
      </aside>
    </main>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-sm border px-3.5 text-sm font-semibold transition",
        active
          ? "border-[#c89b3c] bg-[#c89b3c] text-[#071018]"
          : "border-[#2b2f38] bg-[#111722] text-[#8c95a3] hover:border-[#c89b3c] hover:text-[color:var(--foreground)]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

type HubDataState = {
  label: string;
  detail: string;
  tone: "ready" | "syncing" | "warming";
};

function HubCard({ title, children, accent = false }: { title: string; children: ReactNode; accent?: boolean }) {
  return (
    <section
      className={cn(
        "relative shrink-0 overflow-hidden rounded-xl border bg-[linear-gradient(180deg,rgba(20,28,42,.96),rgba(8,12,20,.94))] p-3 shadow-[0_16px_38px_rgba(0,0,0,.34),inset_0_1px_0_rgba(255,255,255,.06)]",
        accent ? "border-[#c89b3c]/36" : "border-white/10"
      )}
    >
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      {accent && <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#c89b3c]/12 blur-2xl" />}
      <div className="font-display text-xs font-bold uppercase tracking-[0.08em] text-[#c89b3c]">{title}</div>
      {children}
    </section>
  );
}

function TodayPuzzleCard({ label, dataState }: { label: string; dataState: HubDataState }) {
  const toneClass =
    dataState.tone === "ready"
      ? "bg-green-400/14 text-green-100 ring-green-300/20"
      : dataState.tone === "syncing"
        ? "bg-sky-400/14 text-sky-100 ring-sky-300/20"
        : "bg-[#c89b3c]/14 text-[#f2d36b] ring-[#c89b3c]/20";
  const progressWidth = dataState.tone === "ready" ? "w-full bg-green-400" : dataState.tone === "syncing" ? "w-2/3 bg-sky-300" : "w-1/3 bg-[#c89b3c]";

  return (
    <HubCard title="Today's Puzzle" accent>
      <div className="mt-2 text-lg font-semibold">{label}</div>
      <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--muted)]">
        <span>{dataState.label}</span>
        <span className={cn("rounded-full px-2 py-1 ring-1", toneClass)}>{dataState.tone === "ready" ? "Ready" : dataState.tone === "syncing" ? "Syncing" : "Warming"}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className={cn("h-1.5 rounded-full transition-all", progressWidth)} />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-[color:var(--muted)]">{dataState.detail}</p>
    </HubCard>
  );
}

function DailyProgressCard({ stats }: { stats: DailyChallengeResponse["stats"] }) {
  return (
    <HubCard title="Daily Progress">
      <div className="mt-3 grid grid-cols-2 gap-3">
        <ProgressStat label="Streak" value={String(stats.currentStreak)} />
        <ProgressStat label="Best" value={String(stats.maxStreak)} />
        <ProgressStat label="Winrate" value={`${stats.winRate}%`} />
        <ProgressStat label="Perfect" value={String(stats.perfectSolves)} />
      </div>
    </HubCard>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[color:var(--muted)]">{label}</div>
    </div>
  );
}

function RankCard({ rank }: { rank: string }) {
  return (
    <HubCard title="Current Rank">
      <div className="mt-2 font-display text-2xl font-bold">{rank}</div>
      <p className="mt-1 text-xs text-[color:var(--muted)]">Complete today&apos;s puzzle to improve placement.</p>
    </HubCard>
  );
}

function LeaderboardPreview({ entries }: { entries: LeaderboardEntry[] }) {
  const preview = entries.slice(0, 3);

  return (
    <HubCard title="Today's Top Solves">
      <div className="mt-2 grid gap-2 text-sm">
        {preview.length > 0 ? preview.map((entry) => (
          <div key={`${entry.rank}-${entry.username}`} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2">
            <span className="font-display text-[#c89b3c]">{entry.rank}</span>
            <span className="truncate">{entry.username}</span>
            <span className="text-xs text-[color:var(--muted)]">{entry.winRate}%</span>
          </div>
        )) : <p className="text-xs leading-5 text-[color:var(--muted)]">No verified leaderboard entries yet.</p>}
      </div>
    </HubCard>
  );
}

function ProfileHub({
  username,
  favoriteRole,
  gamesPlayed,
  wins
}: {
  username: string;
  favoriteRole: string;
  gamesPlayed: number;
  wins: number;
}) {
  const guest = username === "Guest" || (favoriteRole === "Unclaimed" && gamesPlayed === 0 && wins === 0);

  return (
    <HubCard title="Player Profile">
      <div className="mt-2 truncate text-lg font-semibold">{username}</div>
      {guest ? (
        <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">Sign in to save streaks and leaderboard scores.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/7 px-2 py-1">{favoriteRole}</span>
          <span className="rounded-full bg-white/7 px-2 py-1">{wins} wins</span>
          <span className="rounded-full bg-white/7 px-2 py-1">{gamesPlayed} games</span>
        </div>
      )}
    </HubCard>
  );
}

function currentGameLabel(view: View) {
  const labels: Record<View, string> = {
    "item-build": "Item Build Puzzle",
    "item-recipe": "Item Recipe Puzzle",
    "guess-elo": "Guess the Elo",
    "champion-matchup": "Champion Matchup",
    "dodge-queue": "Dodge or Queue",
    trainer: "Rift Trainer",
    leaderboard: "Leaderboard"
  };

  return labels[view];
}

function hasRecoverableDataGap(daily: DailyChallengeResponse) {
  const build = daily.extraChallenges.itemBuild;

  return (
    build.possibleItems.length === 0 ||
    build.possibleBoots.length === 0 ||
    !build.winrateStats?.buildGames ||
    Boolean(daily.extraChallenges.guessElo.unavailableReason) ||
    (daily.extraChallenges.guessElo.rounds?.length ?? 0) === 0 ||
    Boolean(daily.extraChallenges.dodgeQueue.unavailableReason) ||
    (daily.extraChallenges.dodgeQueue.rounds?.length ?? 0) === 0 ||
    Boolean(daily.extraChallenges.championMatchup.unavailableReason) ||
    (daily.extraChallenges.championMatchup.rounds?.length ?? 0) === 0
  );
}

function hasRecoverableDataGapForView(daily: DailyChallengeResponse, view: View) {
  const extra = daily.extraChallenges;

  if (view === "item-build") {
    return extra.itemBuild.possibleItems.length === 0 || extra.itemBuild.possibleBoots.length === 0 || !extra.itemBuild.winrateStats?.buildGames;
  }

  if (view === "guess-elo") {
    return Boolean(extra.guessElo.unavailableReason) || (extra.guessElo.rounds?.length ?? 0) === 0;
  }

  if (view === "dodge-queue") {
    return Boolean(extra.dodgeQueue.unavailableReason) || (extra.dodgeQueue.rounds?.length ?? 0) === 0;
  }

  if (view === "champion-matchup") {
    return Boolean(extra.championMatchup.unavailableReason) || (extra.championMatchup.rounds?.length ?? 0) === 0;
  }

  return false;
}

function dataStateForView(daily: DailyChallengeResponse, view: View, refreshing: boolean, recoveryAttempts: number): HubDataState {
  if (refreshing) {
    return {
      label: "Live data",
      detail: "Syncing Riot catalog, verified matches, and leaderboard state.",
      tone: "syncing"
    };
  }

  const extra = daily.extraChallenges;
  const states: Partial<Record<View, HubDataState>> = {
    "item-build": extra.itemBuild.winrateStats?.buildGames
      ? {
          label: "Live data",
          detail: `${extra.itemBuild.winrateStats.buildGames} verified build samples loaded for this puzzle.`,
          tone: "ready"
        }
      : {
          label: "Live data",
          detail: "Build board is playable; verified winrate samples are still warming.",
          tone: "warming"
        },
    "guess-elo": extra.guessElo.rounds?.length
      ? {
          label: "Verified rounds",
          detail: `${extra.guessElo.rounds.length} Match-V5 loading screens ready.`,
          tone: "ready"
        }
      : {
          label: "Verified rounds",
          detail: `Collecting balanced ranked lobbies${recoveryAttempts ? `, retry ${recoveryAttempts}/4` : ""}.`,
          tone: "warming"
        },
    "dodge-queue": extra.dodgeQueue.rounds?.length
      ? {
          label: "Verified lobbies",
          detail: `${extra.dodgeQueue.rounds.length} Match-V5 champ-select calls ready.`,
          tone: "ready"
        }
      : {
          label: "Verified lobbies",
          detail: `Collecting ranked lobbies with exact lane/spell data${recoveryAttempts ? `, retry ${recoveryAttempts}/4` : ""}.`,
          tone: "warming"
        },
    "champion-matchup": extra.championMatchup.rounds?.length
      ? {
          label: "Matchup cache",
          detail: `${extra.championMatchup.rounds.length} exact 20+ game champion-lane pairs ready.`,
          tone: "ready"
        }
      : {
          label: "Matchup cache",
          detail: "Strict 20+ game champion-lane pairs are warming from current-patch Match-V5 data.",
          tone: "warming"
        }
  };

  return states[view] ?? {
    label: "Status",
    detail: "Ready for today's run.",
    tone: "ready"
  };
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
