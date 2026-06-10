"use client";

import { Crown, Medal, RefreshCw, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { LeaderboardEntry } from "@/types";

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}

export function HomeLeaderboardWidget() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLeaderboard = useCallback(async () => {
    setError("");

    try {
      const response = await fetch("/api/leaderboard?limit=5", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Leaderboard unavailable.");
      }

      const body = (await response.json()) as LeaderboardResponse;
      setEntries(body.entries.slice(0, 5));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Leaderboard unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  return (
    <section className="relative overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,.94),rgba(6,10,18,.96))] p-4 shadow-[0_24px_70px_rgba(0,0,0,.34),inset_0_1px_0_rgba(255,255,255,.05)] sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#f5c542]/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#f5c542]/45 to-transparent" />

      <div className="relative flex items-center justify-between gap-3">
        <div>
          <div className="font-display flex items-center gap-2 text-sm font-black uppercase tracking-[0.1em] text-[#f5c542]">
            <Crown size={18} />
            Leaderboards
          </div>
          <div className="mt-1 text-xs text-[#94a3b8]">Live signed-in runs</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadLeaderboard();
          }}
          className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-[#dce6ff]/75 transition hover:-translate-y-0.5 hover:border-[#f5c542]/40 hover:bg-[#f5c542]/10 hover:text-white"
          aria-label="Refresh leaderboard"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : undefined} />
        </button>
      </div>

      <div className="relative mt-4">
        {loading && <LeaderboardSkeleton />}
        {!loading && error && (
          <div className="rounded-lg border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        )}
        {!loading && !error && entries.length === 0 && <LeaderboardEmptyState />}
        {!loading && !error && entries.length > 0 && (
          <div className="grid gap-2">
            {entries.map((entry) => (
              <HomeLeaderboardRow key={`${entry.rank}:${entry.username}`} entry={entry} />
            ))}
          </div>
        )}
      </div>

      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
        <span className="text-xs text-[#94a3b8]">Ranked by current rank and LP.</span>
        <Link
          href="/play?mode=leaderboard"
          className="font-display inline-flex min-h-10 items-center justify-center rounded-md border border-[#f5c542]/40 bg-[#f5c542]/12 px-4 text-sm font-black text-[#f5c542] transition hover:-translate-y-0.5 hover:bg-[#f5c542] hover:text-[#090b10]"
        >
          Open board
        </Link>
      </div>
    </section>
  );
}

function HomeLeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.045] p-2.5 transition hover:border-[#f5c542]/28 hover:bg-white/[0.07]">
      <div className="grid h-9 w-9 place-items-center rounded-full border border-[#f5c542]/24 bg-[#f5c542]/10 font-display text-sm font-black text-[#f5c542]">
        {entry.rank <= 3 ? <Medal size={16} /> : `#${entry.rank}`}
      </div>
      <div className="min-w-0">
        <div className="truncate font-bold text-white" title={entry.username}>
          {entry.username}
        </div>
        <div className="mt-0.5 truncate text-[11px] font-semibold text-[#f5c542]">{formatCurrentRank(entry)}</div>
      </div>
      <div className="text-right">
        <div className="font-display text-xl font-black leading-none text-white">{entry.currentRankLp}</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[#94a3b8]">LP</div>
      </div>
    </div>
  );
}

function formatCurrentRank(entry: LeaderboardEntry) {
  return `${entry.currentRank} - ${entry.currentRankLp} LP`;
}

function LeaderboardSkeleton() {
  return (
    <div className="grid gap-2" aria-label="Loading leaderboard">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-[4.25rem] animate-pulse rounded-lg border border-white/8 bg-white/[0.045]" />
      ))}
    </div>
  );
}

function LeaderboardEmptyState() {
  return (
    <div className="grid justify-items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="grid h-10 w-10 place-items-center rounded-full border border-[#38bdf8]/25 bg-[#38bdf8]/10 text-[#7dd3fc]">
        <Trophy size={18} />
      </div>
      <div>
        <div className="font-display text-lg font-black text-white">No runs yet</div>
        <p className="mt-1 text-sm leading-6 text-[#94a3b8]">Sign in and lock a round to claim the first spot.</p>
      </div>
      <Link
        href="/play?mode=item-build"
        className="font-display inline-flex min-h-10 items-center justify-center rounded-md border border-[#f5c542] bg-[#f5c542] px-3 py-2 text-sm font-semibold text-[#11141c] transition hover:bg-[#ffe27a]"
      >
        Play first
      </Link>
    </div>
  );
}
