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
    <section className="surface hairline-top relative overflow-hidden p-5 sm:p-6">
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--line-gold)] bg-[rgba(243,198,77,.08)] text-[var(--gold)]">
            <Crown size={16} />
          </span>
          <div>
            <div className="font-display text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--foreground)]">
              Leaderboards
            </div>
            <div className="mt-0.5 text-xs text-[var(--muted)]">Live signed-in runs</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadLeaderboard();
          }}
          className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-1)] text-[var(--muted)] transition hover:-translate-y-0.5 hover:border-[var(--line-gold)] hover:text-white"
          aria-label="Refresh leaderboard"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : undefined} />
        </button>
      </div>

      <div className="relative mt-4">
        {loading && <LeaderboardSkeleton />}
        {!loading && error && (
          <div className="rounded-xl border border-[rgba(224,98,108,.25)] bg-[rgba(224,98,108,.1)] p-4 text-sm text-[#ffd2d6]">
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

      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
        <span className="text-xs text-[var(--muted)]">Ranked by current rank and LP.</span>
        <Link href="/play?mode=leaderboard" className="btn-ghost min-h-10 px-4 text-sm">
          Open board
        </Link>
      </div>
    </section>
  );
}

function HomeLeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-1)] p-2.5 transition hover:border-[var(--line-gold)] hover:bg-[var(--surface-2)]">
      <div className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line-gold)] bg-[rgba(243,198,77,.1)] font-display text-sm font-black text-[var(--gold)]">
        {entry.rank <= 3 ? <Medal size={16} /> : `#${entry.rank}`}
      </div>
      <div className="min-w-0">
        <div className="truncate font-bold text-white" title={entry.username}>
          {entry.username}
        </div>
        <div className="mt-0.5 truncate text-[11px] font-semibold text-[var(--gold)]">{formatCurrentRank(entry)}</div>
      </div>
      <div className="text-right">
        <div className="font-display text-xl font-black leading-none text-white">{entry.currentRankLp}</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">LP</div>
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
        <div key={index} className="h-[4.25rem] animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface-1)]" />
      ))}
    </div>
  );
}

function LeaderboardEmptyState() {
  return (
    <div className="grid justify-items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-1)] p-4">
      <div className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(68,211,203,.25)] bg-[rgba(68,211,203,.1)] text-[var(--teal)]">
        <Trophy size={18} />
      </div>
      <div>
        <div className="font-display text-lg font-black text-white">No runs yet</div>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Sign in and lock a round to claim the first spot.</p>
      </div>
      <Link href="/play?mode=item-build" className="btn-gold min-h-10 px-4 text-sm">
        Play first
      </Link>
    </div>
  );
}
