"use client";

import { Crown, Medal } from "lucide-react";

import { formatMilliseconds } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types";

export function LeaderboardPanel({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <section className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] p-4">
      <div className="mb-4 flex items-center gap-2">
        <Crown size={18} className="text-[color:var(--gold-bright)]" />
        <h2 className="text-lg font-semibold">Leaderboard</h2>
      </div>
      <div className="overflow-x-auto fine-scrollbar">
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
    </section>
  );
}
