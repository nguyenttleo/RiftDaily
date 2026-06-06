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
  Trophy,
  UsersRound,
  Zap
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { AuthPanel } from "@/components/auth-panel";
import {
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
  | "dodge-queue"
  | "trainer"
  | "leaderboard";

export function AppShell() {
  const [daily, setDaily] = useState<DailyChallengeResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [view, setView] = useState<View>("item-build");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadDaily = useCallback(async () => {
    setMessage("");

    try {
      const response = await fetch(`/api/challenges/daily?t=${Date.now()}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Daily load failed.");
      }

      setDaily((await response.json()) as DailyChallengeResponse);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Daily load failed.");
    } finally {
      setLoading(false);
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
          <TabButton active={view === "dodge-queue"} onClick={() => setView("dodge-queue")} icon={<CircleSlash size={16} />} label="Lobby" />
          <TabButton active={view === "trainer"} onClick={() => setView("trainer")} icon={<Crosshair size={16} />} label="Trainer" />
          <TabButton active={view === "leaderboard"} onClick={() => setView("leaderboard")} icon={<Trophy size={16} />} label="Leaderboard" />
          <Button
            type="button"
            variant="ghost"
            className="ml-auto min-h-10 shrink-0 px-3.5"
            onClick={() => {
              void loadDaily();
              void loadLeaderboard();
            }}
            title="Refresh"
            icon={<RefreshCcw size={16} />}
          >
            Refresh
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
        {view === "dodge-queue" && <DodgeQueueGame challenge={daily.extraChallenges.dodgeQueue} username={daily.stats.username} />}
        {view === "trainer" && <TrainerPage dodge={daily.extraChallenges.skillshotDodge} username={daily.stats.username} />}

        {view === "leaderboard" && <LeaderboardPanel entries={leaderboard} />}
        </motion.div>
      </section>

      <aside className="hidden h-screen border-l border-[color:var(--line)] bg-[#080a0d] p-4 lg:sticky lg:top-0 lg:grid lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-[color:var(--gold-bright)]">Rift Daily</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">Daily League mechanics puzzle</p>
          <div className="mt-4 grid gap-1.5 text-xs text-[color:var(--muted)]">
            <span className="inline-flex items-center gap-2"><Clock3 size={14} /> Resets in {formatReset(resetCountdown)}</span>
            <span className="inline-flex items-center gap-2"><Zap size={14} /> Patch {daily.dataDragonVersion}</span>
          </div>
        </div>
        <div className="grid min-h-0 content-start gap-3 overflow-hidden">
          <TodayPuzzleCard label={view === "leaderboard" ? "Leaderboard" : currentGameLabel(view)} />
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

function HubCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-white/10 bg-[#111722]/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
      <div className="font-display text-xs font-bold uppercase tracking-[0.08em] text-[#c89b3c]">{title}</div>
      {children}
    </section>
  );
}

function TodayPuzzleCard({ label }: { label: string }) {
  return (
    <HubCard title="Today's Puzzle">
      <div className="mt-2 text-lg font-semibold">{label}</div>
      <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--muted)]">
        <span>Status</span>
        <span className="rounded-full bg-[#c89b3c]/12 px-2 py-1 text-[#f2d36b]">Unsolved</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/8">
        <div className="h-1.5 w-1/3 rounded-full bg-[#c89b3c]" />
      </div>
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
    "dodge-queue": "Dodge or Queue",
    trainer: "Rift Trainer",
    leaderboard: "Leaderboard"
  };

  return labels[view];
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
