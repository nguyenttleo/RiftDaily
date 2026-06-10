"use client";

import { Crown, Medal, X } from "lucide-react";
import { useState } from "react";

import { formatMilliseconds } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types";

export function LeaderboardPanel({ entries }: { entries: LeaderboardEntry[] }) {
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null);

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
            <button
              key={`${entry.rank}-${entry.username}:mobile`}
              type="button"
              onClick={() => setSelectedEntry(entry)}
              className="rounded-lg border border-[color:var(--line)] bg-white/6 p-3 text-left transition hover:border-[#c89b3c]/45 hover:bg-white/9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b3c]/55"
              aria-label={`Open ${entry.username} leaderboard details`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold text-[color:var(--gold-bright)]">
                    {entry.rank <= 3 ? <Medal size={16} /> : null}
                    #{entry.rank}
                  </div>
                  <div className="mt-1 truncate text-base font-bold">{entry.username}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-bold text-[#f5c542]">{entry.currentRank}</div>
                  <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--muted)]">{entry.currentRankLp} LP</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {entries.length > 0 && (
        <div className="hidden overflow-x-auto fine-scrollbar sm:block">
          <div className="min-w-[34rem]">
            <div className="grid grid-cols-[4rem_1fr_12rem] gap-2 px-2 pb-2 text-xs text-[color:var(--muted)]">
              <span>Rank</span>
              <span>Player</span>
              <span>Current Rank</span>
            </div>
            <div className="grid gap-2">
              {entries.map((entry) => (
                <button
                  key={`${entry.rank}-${entry.username}`}
                  type="button"
                  onClick={() => setSelectedEntry(entry)}
                  className="grid grid-cols-[4rem_1fr_12rem] items-center gap-2 rounded-md border border-[color:var(--line)] bg-white/6 p-2 text-left text-sm transition hover:border-[#c89b3c]/45 hover:bg-white/9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b3c]/55"
                  aria-label={`Open ${entry.username} leaderboard details`}
                >
                  <div className="flex items-center gap-2 font-semibold text-[color:var(--gold-bright)]">
                    {entry.rank <= 3 ? <Medal size={16} /> : null}
                    {entry.rank}
                  </div>
                  <div className="truncate font-semibold">{entry.username}</div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[#f5c542]" title={formatCurrentRank(entry)}>{entry.currentRank}</div>
                    <div className="text-xs text-[color:var(--muted)]">{entry.currentRankLp} LP</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {selectedEntry && <LeaderboardPlayerModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />}
    </section>
  );
}

function LeaderboardPlayerModal({ entry, onClose }: { entry: LeaderboardEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/72 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="relative w-full max-w-md rounded-lg border border-[#c89b3c]/35 bg-[linear-gradient(180deg,rgba(18,27,44,.98),rgba(5,8,16,.99))] p-4 text-left shadow-[0_28px_90px_rgba(0,0,0,.55)]" role="dialog" aria-modal="true" aria-labelledby="leaderboard-player-title">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/6 text-white/75 transition hover:border-[#c89b3c]/45 hover:bg-[#c89b3c]/12 hover:text-white"
          aria-label="Close player details"
        >
          <X size={16} />
        </button>

        <div className="pr-10">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#c89b3c]">Leaderboard #{entry.rank}</div>
          <h3 id="leaderboard-player-title" className="mt-1 truncate font-display text-2xl font-black text-white" title={entry.username}>{entry.username}</h3>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <LeaderboardDetailStat label="Current Rank" value={formatCurrentRank(entry)} accent />
          <LeaderboardDetailStat label="Peak Rank" value={formatPeakRank(entry)} />
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--muted)]">Total Stats</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <LeaderboardDetailStat label="Streak" value={String(entry.currentStreak)} />
            <LeaderboardDetailStat label="Best" value={String(entry.maxStreak)} />
            <LeaderboardDetailStat label="Games" value={String(entry.gamesPlayed)} />
            <LeaderboardDetailStat label="Win" value={`${entry.winRate}%`} />
            <LeaderboardDetailStat label="Perfect" value={String(entry.perfectSolves)} />
            <LeaderboardDetailStat label="Fastest" value={formatMilliseconds(entry.fastestSolveMs)} />
          </div>
        </div>
      </section>
    </div>
  );
}

function LeaderboardDetailStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black/20 p-2">
      <div className={accent ? "truncate font-display text-base font-black text-[#f5c542]" : "truncate font-semibold text-[color:var(--foreground)]"} title={value}>{value}</div>
      <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.08em] text-[color:var(--muted)]">{label}</div>
    </div>
  );
}

function formatCurrentRank(entry: LeaderboardEntry) {
  return `${entry.currentRank} - ${entry.currentRankLp} LP`;
}

function formatPeakRank(entry: LeaderboardEntry) {
  return `${entry.peakRank} - ${entry.peakRankLp} LP`;
}
