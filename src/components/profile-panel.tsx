"use client";

import { BadgeCheck, Shield, Star, Swords } from "lucide-react";

import { StatStrip } from "@/components/stat-strip";
import type { UserStats } from "@/types";

export function ProfilePanel({ stats }: { stats: UserStats }) {
  const details = [
    { label: "Rank", value: stats.rank, icon: BadgeCheck },
    { label: "Favorite role", value: stats.favoriteRole, icon: Swords },
    { label: "Wins", value: `${stats.wins}`, icon: Star },
    { label: "Games", value: `${stats.gamesPlayed}`, icon: Shield }
  ];

  return (
    <section className="grid gap-4 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] p-4">
      <div>
        <h2 className="text-lg font-semibold">{stats.username}</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{stats.rank}</p>
      </div>
      <StatStrip stats={stats} />
      <div className="grid gap-2 sm:grid-cols-4">
        {details.map((detail) => {
          const Icon = detail.icon;

          return (
            <div key={detail.label} className="rounded-md border border-[color:var(--line)] bg-white/6 p-3">
              <div className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
                <Icon size={15} />
                {detail.label}
              </div>
              <div className="mt-2 text-lg font-semibold">{detail.value}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
