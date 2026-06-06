"use client";

import { Crown, Medal } from "lucide-react";

import { formatMilliseconds } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types";

export function LeaderboardPanel({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <section className="min-h-[calc(100dvh-5rem)] rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-3 sm:p-4 lg:min-h-0 lg:rounded-md">
      <div className="mb-4 flex items-center gap-2">
        <Crown size={18} className="text-[color:var(--gold-bright)]" />
        <h2 className="text-lg font-semibold">Leaderboard</h2>
      </div>
      {entries.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-[color:var(--muted)]">
          No verified scores yet. Sign in and lock a few runs to start filling this board.
        </div>
      )}
      {entries.length > 0 && (
        <div className="grid gap-2 sm:hidden">
          {entries.map((entry) => (
            <div key={`${entry.rank}-${entry.username}:mobile`} className="rounded-lg border border-[color:var(--line)] bg-white/6 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold text-[color:var(--gold-bright)]">
                    {entry.rank <= 3 ? <Medal size={16} /> : null}
                    #{entry.rank}
                  </div>
                  <div className="mt-1 truncate text-base font-bold">{entry.username}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl font-bold">{entry.currentStreak}</div>
                  <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--muted)]">Streak</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs text-[color:var(--muted)]">
                <LeaderboardMiniStat label="Best" value={String(entry.maxStreak)} />
                <LeaderboardMiniStat label="Games" value={String(entry.gamesPlayed)} />
                <LeaderboardMiniStat label="Win" value={`${entry.winRate}%`} />
                <LeaderboardMiniStat label="Fastest" value={formatMilliseconds(entry.fastestSolveMs)} />
              </div>
            </div>
          ))}
        </div>
      )}
      {entries.length > 0 && (
      <div className="hidden overflow-x-auto fine-scrollbar sm:block">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-[4rem_1fr_repeat(5,6.8rem)] gap-2 px-2 pb-2 text-xs text-[color:var(--muted)]">
            <span>Rank</span>
            <span>Player</span>
            <span>Streak</span>
            <span>Best</span>
            <span>Games</span>
            <span>Win</span>
            <span>Fastest</span>
          </div>
          <div className="grid gap-2">
            {entries.map((entry) => (
              <div
                key={`${entry.rank}-${entry.username}`}
                className="grid grid-cols-[4rem_1fr_repeat(5,6.8rem)] items-center gap-2 rounded-md border border-[color:var(--line)] bg-white/6 p-2 text-sm"
              >
                <div className="flex items-center gap-2 font-semibold text-[color:var(--gold-bright)]">
                  {entry.rank <= 3 ? <Medal size={16} /> : null}
                  {entry.rank}
                </div>
                <div className="truncate font-semibold">{entry.username}</div>
                <div>{entry.currentStreak}</div>
                <div>{entry.maxStreak}</div>
                <div>{entry.gamesPlayed}</div>
                <div>{entry.winRate}%</div>
                <div>{formatMilliseconds(entry.fastestSolveMs)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}
    </section>
  );
}

function LeaderboardMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black/20 p-2">
      <div className="truncate font-semibold text-[color:var(--foreground)]">{value}</div>
      <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.08em]">{label}</div>
    </div>
  );
}
