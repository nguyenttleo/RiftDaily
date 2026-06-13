"use client";

import { Flame, Gauge, Medal, Timer, Trophy } from "lucide-react";

import { formatMilliseconds } from "@/lib/utils";
import type { UserStats } from "@/types";

export function StatStrip({ stats }: { stats: UserStats }) {
  const items = [
    { label: "Streak", value: `${stats.currentStreak}`, icon: Flame },
    { label: "Best", value: `${stats.maxStreak}`, icon: Trophy },
    { label: "Win rate", value: `${stats.winRate}%`, icon: Gauge },
    { label: "Perfect", value: `${stats.perfectSolves}`, icon: Medal },
    { label: "Fastest", value: formatMilliseconds(stats.fastestSolveMs), icon: Timer }
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <div key={item.label} className="rounded-xl border border-[color:var(--line)] bg-[var(--surface-1)] p-3">
            <div className="flex items-center gap-2 text-xs uppercase text-[color:var(--muted)]">
              <Icon size={14} />
              {item.label}
            </div>
            <div className="mt-2 text-xl font-semibold text-[color:var(--foreground)]">{item.value}</div>
          </div>
        );
      })}
    </div>
  );
}
