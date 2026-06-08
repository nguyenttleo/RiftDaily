"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Grid2X2, Layers, Trophy, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuthPanel } from "@/components/auth-panel";
import { CopyLinkButton } from "@/components/copy-link-button";
import { NexusLoader } from "@/components/nexus-loader";
import { PromotionModal } from "@/components/promotion-modal";
import { RiftCommandBar, type PlayMode, type PlayProduct } from "@/components/rift-command-bar";
import { Button } from "@/components/ui/button";
import {
  applyRankedResult,
  calculateLpDelta,
  createInitialRankState,
  displayRankName,
  getRankPromotionDetail,
  nextRankProgress,
  normalizeRankState,
  parseLeagueRankState,
  rankedStorageKey,
  rankPromotionEventName,
  type LeagueRankState,
  type RankPromotionEventDetail
} from "@/game/scoring";
import { cn } from "@/lib/utils";
import type { UserStats } from "@/types";
import type { TftConnectionsCategory, TftConnectionsRound, TftDailyResponse, TftItemRef, TftRecipeRound, TftUnitRef } from "@/types/tft";

type TftMode = Extract<PlayMode, "tft-recipe" | "tft-connections">;
type TftGameKey = "tft-recipe" | "tft-connections";
type TftCategoryColor = {
  border: string;
  bgTop: string;
  bgBottom: string;
  text: string;
};

const tftCategoryColors: TftCategoryColor[] = [
  { border: "rgba(250, 204, 21, .62)", bgTop: "rgba(113, 63, 18, .74)", bgBottom: "rgba(39, 28, 10, .92)", text: "#fde68a" },
  { border: "rgba(45, 212, 191, .58)", bgTop: "rgba(13, 78, 89, .72)", bgBottom: "rgba(8, 35, 43, .92)", text: "#99f6e4" },
  { border: "rgba(96, 165, 250, .58)", bgTop: "rgba(30, 64, 175, .64)", bgBottom: "rgba(12, 24, 62, .92)", text: "#bfdbfe" },
  { border: "rgba(244, 114, 182, .58)", bgTop: "rgba(131, 24, 67, .64)", bgBottom: "rgba(54, 16, 38, .92)", text: "#fbcfe8" }
];

const tftGuestStats: UserStats = {
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

const tftStreakUpdateEventName = "rift-daily:streak-updated";

export function TftPlayShell({
  view,
  onModeSelect,
  onProductSelect
}: {
  view: TftMode;
  onModeSelect: (mode: PlayMode) => void;
  onProductSelect: (product: PlayProduct) => void;
}) {
  const [daily, setDaily] = useState<TftDailyResponse | null>(null);
  const [stats, setStats] = useState<UserStats>(tftGuestStats);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [promotion, setPromotion] = useState<RankPromotionEventDetail | null>(null);
  const resetCountdown = useTftResetCountdown(daily?.resetAt);
  const displayStats = useTftRankedStats(stats);
  const rankState = tftRankStateFromStats(displayStats);
  const rankProgress = nextRankProgress(rankState);

  const loadStats = useCallback(async () => {
    const response = await fetch("/api/stats/me", { cache: "no-store" });

    if (response.ok) {
      const body = (await response.json()) as { stats: UserStats };
      setStats(body.stats);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTftDaily() {
      setLoading(true);
      setMessage("");

      try {
        const response = await fetch("/api/tft/daily", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("TFT load failed.");
        }

        const body = (await response.json()) as TftDailyResponse;

        if (!cancelled) {
          setDaily(body);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "TFT load failed.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadTftDaily();
    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [loadStats]);

  useEffect(() => {
    const refreshStats = () => {
      void loadStats();
    };

    window.addEventListener(tftStreakUpdateEventName, refreshStats);
    return () => {
      window.removeEventListener(tftStreakUpdateEventName, refreshStats);
    };
  }, [loadStats]);

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

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center overflow-hidden bg-[#050607] px-4">
        <NexusLoader />
      </main>
    );
  }

  if (!daily) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="rounded-md border border-red-400/30 bg-red-500/12 p-4 text-red-100">{message || "Unable to load TFT."}</div>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh items-start overflow-x-clip bg-[#050607] lg:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="grid min-h-dvh min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 p-2 transition-[gap] duration-300 ease-out sm:gap-3 sm:p-4 lg:grid-rows-[auto_minmax(0,1fr)]">
        <motion.div
          layout
          transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
          className="min-w-0 transition-[grid-column,grid-row] duration-300 ease-out"
        >
          <RiftCommandBar
            activeMode={view}
            activeProduct="tft"
            brandVariant="sleek"
            onModeSelect={onModeSelect}
            onProductSelect={onProductSelect}
            position="sticky"
            showCta={false}
            showProductSwitch
            className="transition-[box-shadow,filter] duration-200 ease-out"
          />
        </motion.div>

        <TftMobileHub daily={daily} view={view} resetCountdown={resetCountdown} stats={displayStats} rankProgress={rankProgress} />

        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="min-h-0 overflow-visible lg:overflow-hidden"
        >
          {view === "tft-recipe" && <TftRecipeGame rounds={daily.recipe.rounds} setNumber={daily.setNumber} username={displayStats.username} onStatsChange={loadStats} />}
          {view === "tft-connections" && <TftConnectionsGame rounds={daily.connections.rounds} setNumber={daily.setNumber} username={displayStats.username} onStatsChange={loadStats} />}
        </motion.div>

        <div className="lg:hidden">
          <AuthPanel onAuthChange={loadStats} />
        </div>
      </section>

      <TftSidebar daily={daily} view={view} resetCountdown={resetCountdown} stats={displayStats} rankProgress={rankProgress} onAuthChange={loadStats} />
      {promotion && <PromotionModal key={`${promotion.toRank}:${promotion.lp}:${promotion.lpChange ?? 0}`} promotion={promotion} onClose={() => setPromotion(null)} />}
    </main>
  );
}

function TftRecipeGame({
  rounds,
  setNumber,
  username,
  onStatsChange
}: {
  rounds: TftRecipeRound[];
  setNumber: number;
  username: string;
  onStatsChange: () => void;
}) {
  const [roundIndex, setRoundIndex] = useState(0);
  const [answerId, setAnswerId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [streak, recordResult] = useTftModeProgress("tft-recipe", username, onStatsChange);
  const round = rounds[roundIndex % Math.max(1, rounds.length)];
  const correct = submitted && answerId === round.missingComponent.id;

  function choose(component: TftItemRef) {
    if (submitted) {
      return;
    }

    const solved = component.id === round.missingComponent.id;
    setAnswerId(component.id);
    setSubmitted(true);
    recordResult(solved, {
      performanceQuality: solved ? 0.82 : 0.2,
      roundId: round.id,
      metadata: {
        resultItem: round.resultItem.name,
        selectedComponent: component.name,
        answerComponent: round.missingComponent.name
      }
    });
  }

  function nextRound() {
    setRoundIndex((current) => current + 1);
    setAnswerId("");
    setSubmitted(false);
  }

  return (
    <TftFrame
      icon={<Layers size={18} />}
      title="TFT Recipe"
      accessory={<TftHeaderTools><TftRoundPill label={`Set ${setNumber}`} value={String((roundIndex % Math.max(1, rounds.length)) + 1)} /><TftMiniStreak current={streak.current} best={streak.best} /><CopyLinkButton mode="tft-recipe" product="tft" /></TftHeaderTools>}
    >
      <div className="grid flex-1 gap-3 lg:min-h-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="play-panel-depth grid content-start gap-3 rounded-sm border border-[#3c3421] p-3 sm:p-4">
          <div className="grid justify-items-center gap-3 rounded-sm border border-white/10 bg-[#050607]/74 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.045)]">
            <TftItemTile item={round.resultItem} size="large" />
            <div className="font-display text-center text-2xl font-black leading-none text-white sm:text-3xl">{round.resultItem.name}</div>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <TftComponentSlot item={round.knownComponent} />
            <div className="font-display text-xl font-black text-[#c89b3c]">+</div>
            {submitted ? (
              <TftComponentSlot item={round.missingComponent} result={correct ? "correct" : "answer"} />
            ) : (
              <div className="grid min-h-28 place-items-center rounded-sm border border-dashed border-[#c89b3c]/40 bg-[#c89b3c]/10 text-center font-display text-sm font-black uppercase tracking-[0.12em] text-[#f1d58a]">
                Missing
              </div>
            )}
          </div>
          {submitted && (
            <div className={cn("rounded-sm border p-3 text-sm font-semibold", correct ? "border-green-400/40 bg-green-500/14 text-green-100" : "border-red-400/40 bg-red-500/14 text-red-100")}>
              {correct ? "Correct item slam." : `Answer: ${round.missingComponent.name}`}
            </div>
          )}
        </div>

        <div className="play-inset-panel-depth grid min-h-0 content-start gap-3 rounded-sm border border-white/10 p-3 sm:p-4">
          <div className="font-display text-base font-extrabold tracking-tight text-white sm:text-xl">
            Slam the correct components to make {round.resultItem.name}.
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {round.options.map((component) => {
              const selected = answerId === component.id;
              const answer = submitted && component.id === round.missingComponent.id;

              return (
                <button
                  key={component.id}
                  type="button"
                  onClick={() => choose(component)}
                  disabled={submitted}
                  className={cn(
                    "play-choice-depth play-choice-depth-default group relative grid min-h-28 justify-items-center gap-2 rounded-sm border border-[#3c3421] p-2 text-center transition disabled:cursor-default",
                    !submitted && "hover:-translate-y-0.5 hover:border-[#c89b3c]/70",
                    selected && correct && "border-green-300/70 bg-green-500/18",
                    selected && !correct && submitted && "border-red-300/70 bg-red-500/18",
                    answer && "ring-2 ring-green-300/60"
                  )}
                >
                  <TftItemTile item={component} />
                  <div className="text-xs font-bold leading-tight text-white">{component.name}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {submitted && (
              <Button type="button" onClick={nextRound}>
                Next recipe
              </Button>
            )}
          </div>
        </div>
      </div>
    </TftFrame>
  );
}

function TftConnectionsGame({
  rounds,
  setNumber,
  username,
  onStatsChange
}: {
  rounds: TftConnectionsRound[];
  setNumber: number;
  username: string;
  onStatsChange: () => void;
}) {
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [solvedIds, setSolvedIds] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(4);
  const [lastResult, setLastResult] = useState<"correct" | "wrong" | "">("");
  const [streak, recordResult] = useTftModeProgress("tft-connections", username, onStatsChange);
  const round = rounds[roundIndex % Math.max(1, rounds.length)];
  const solvedIdSet = useMemo(() => new Set(solvedIds), [solvedIds]);
  const solvedCategories = round.categories.filter((category) => solvedIdSet.has(category.id));
  const remainingUnits = round.units.filter((unit) => !round.categories.some((category) => solvedIdSet.has(category.id) && category.unitIds.includes(unit.id)));
  const complete = solvedCategories.length === round.categories.length;
  const failed = mistakes <= 0 && !complete;

  function toggleUnit(unitId: string) {
    if (complete || failed) {
      return;
    }

    setSelectedIds((current) => {
      if (current.includes(unitId)) {
        return current.filter((id) => id !== unitId);
      }

      if (current.length >= 4) {
        return current;
      }

      return [...current, unitId];
    });
  }

  function submitSelection() {
    if (selectedIds.length !== 4 || complete || failed) {
      return;
    }

    const selectedKey = toSortedKey(selectedIds);
    const match = round.categories.find((category) => !solvedIdSet.has(category.id) && toSortedKey(category.unitIds) === selectedKey);

    if (match) {
      const nextSolvedIds = [...solvedIds, match.id];
      const solvedBoard = nextSolvedIds.length === round.categories.length;

      setSolvedIds(nextSolvedIds);
      setSelectedIds([]);
      setLastResult("correct");
      setMistakes(4);

      if (solvedBoard) {
        recordResult(true, {
          performanceQuality: Math.max(0.75, mistakes / 4),
          roundId: round.id,
          metadata: {
            setNumber,
            categories: round.categories.map((category) => category.label),
            mistakesRemaining: mistakes
          }
        });
      }
      return;
    }

    const nextMistakes = Math.max(0, mistakes - 1);

    setMistakes(nextMistakes);
    setSelectedIds([]);
    setLastResult("wrong");

    if (nextMistakes === 0) {
      recordResult(false, {
        performanceQuality: 0.1,
        roundId: round.id,
        metadata: {
          setNumber,
          categories: round.categories.map((category) => category.label)
        }
      });
    }
  }

  function nextBoard() {
    setRoundIndex((current) => current + 1);
    setSelectedIds([]);
    setSolvedIds([]);
    setMistakes(4);
    setLastResult("");
  }

  return (
    <TftFrame
      icon={<Grid2X2 size={18} />}
      title="TFT Connections"
      accessory={<TftHeaderTools><TftRoundPill label={`Set ${setNumber}`} value={String((roundIndex % Math.max(1, rounds.length)) + 1)} /><TftMiniStreak current={streak.current} best={streak.best} /><CopyLinkButton mode="tft-connections" product="tft" /></TftHeaderTools>}
    >
      <div className="grid flex-1 gap-3 lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className={cn("grid gap-2", failed && "hidden")}>
          {solvedCategories.map((category) => (
            <SolvedConnectionsCategory key={category.id} category={category} round={round} color={categoryColorForIndex(round.categories.indexOf(category))} />
          ))}
        </div>

        <div className="play-panel-depth grid min-h-0 grid-cols-2 gap-2 rounded-sm border border-[#3c3421] p-2 sm:grid-cols-4 sm:p-3">
          {failed ? round.categories.map((category, index) => (
            <SolvedConnectionsCategory key={category.id} category={category} round={round} color={categoryColorForIndex(index)} large />
          )) : remainingUnits.map((unit) => (
            <button
              key={unit.id}
              type="button"
              onClick={() => toggleUnit(unit.id)}
              disabled={complete || failed}
              className={cn(
                "play-card-depth relative grid min-h-28 content-between overflow-hidden rounded-sm border bg-[#071018] p-2 text-left transition disabled:cursor-default sm:min-h-36",
                selectedIds.includes(unit.id) ? "border-[#f5c542]/80 ring-2 ring-[#f5c542]/35" : "border-[#3c3421] hover:-translate-y-0.5 hover:border-[#c89b3c]/65"
              )}
            >
              <div className="absolute inset-0 bg-cover bg-center opacity-55" style={{ backgroundImage: `url(${unit.imageUrl})` }} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050607] via-[#050607]/66 to-transparent" />
              <div className="relative min-h-5" />
              <div className="relative">
                <div className="truncate font-display text-base font-black text-white sm:text-lg">{unit.name}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-sm text-[color:var(--muted)]">
            {selectedIds.length}/4 selected
          </div>
          <div className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-sm text-[color:var(--muted)]">
            {mistakes} misses
          </div>
          {lastResult && (
            <div className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold", lastResult === "correct" ? "border-green-400/35 bg-green-500/14 text-green-100" : "border-red-400/35 bg-red-500/14 text-red-100")}>
              {lastResult === "correct" ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              {lastResult === "correct" ? "Matched" : "Missed"}
            </div>
          )}
          {!complete && !failed && (
            <Button type="button" disabled={selectedIds.length !== 4} onClick={submitSelection}>
              Submit
            </Button>
          )}
          {(complete || failed) && (
            <Button type="button" onClick={nextBoard}>
              Next board
            </Button>
          )}
        </div>
      </div>
    </TftFrame>
  );
}

function SolvedConnectionsCategory({
  category,
  round,
  color,
  large = false
}: {
  category: TftConnectionsCategory;
  round: TftConnectionsRound;
  color: TftCategoryColor;
  large?: boolean;
}) {
  const units = category.unitIds
    .map((unitId) => round.units.find((unit) => unit.id === unitId))
    .filter((unit): unit is TftUnitRef => Boolean(unit));

  return (
    <div
      className={cn(
        "rounded-sm border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_14px_34px_rgba(0,0,0,.25)]",
        large && "grid min-h-28 content-center sm:min-h-36"
      )}
      style={{
        borderColor: color.border,
        background: `linear-gradient(180deg, ${color.bgTop}, ${color.bgBottom})`
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-base font-black text-white">{category.label}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-white/78">
        {units.map((unit) => unit.name).join(" / ")}
      </div>
    </div>
  );
}

function TftFrame({
  icon,
  title,
  accessory,
  children
}: {
  icon: ReactNode;
  title: string;
  accessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="play-area-depth flex h-auto min-h-[calc(100dvh-5rem)] flex-col gap-2 rounded-lg border border-[#3c3421] p-2 pb-16 sm:gap-3 sm:p-4 lg:h-full lg:min-h-0 lg:rounded-sm">
      <div className="play-area-content flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[#c89b3c]">{icon}</span>
            <h2 className="truncate text-lg font-semibold sm:text-xl">{title}</h2>
          </div>
          {accessory}
        </div>
        {children}
      </div>
    </section>
  );
}

function TftItemTile({ item, size = "normal" }: { item: TftItemRef; size?: "normal" | "large" }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-sm border border-[#c89b3c]/32 bg-[#050607]/75 shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_10px_26px_rgba(0,0,0,.28)]",
        size === "large" ? "h-20 w-20 sm:h-24 sm:w-24" : "h-12 w-12"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt="" className={cn("object-contain", size === "large" ? "h-16 w-16 sm:h-20 sm:w-20" : "h-9 w-9")} />
    </div>
  );
}

function TftComponentSlot({ item, result }: { item: TftItemRef; result?: "correct" | "answer" }) {
  return (
    <div
      className={cn(
        "grid min-h-28 justify-items-center gap-2 rounded-sm border bg-[#111722] p-2 text-center",
        result === "correct" ? "border-green-300/65" : result === "answer" ? "border-[#c89b3c]/65" : "border-[#3c3421]"
      )}
    >
      <TftItemTile item={item} />
      <div className="text-xs font-bold leading-tight text-white">{item.name}</div>
    </div>
  );
}

function TftRoundPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex min-h-9 items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-[color:var(--muted)]">
      {label} <b className="relative top-px font-display leading-none text-[#f5c542]">{value}</b>
    </div>
  );
}

function TftHeaderTools({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}

function TftMiniStreak({ current, best }: { current: number; best: number }) {
  return (
    <div className="inline-flex min-h-9 items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-[color:var(--muted)]">
      Streak <b className="relative top-px font-display leading-none text-white">{current}</b>
      <span className="text-white/25">/</span>
      Best <b className="relative top-px font-display leading-none text-white">{best}</b>
    </div>
  );
}

function categoryColorForIndex(index: number) {
  return tftCategoryColors[index % tftCategoryColors.length];
}

function TftMobileHub({
  daily,
  view,
  resetCountdown,
  stats,
  rankProgress
}: {
  daily: TftDailyResponse;
  view: TftMode;
  resetCountdown: string;
  stats: UserStats;
  rankProgress: ReturnType<typeof nextRankProgress>;
}) {
  return (
    <div className="lg:hidden">
      <section className="relative shrink-0 overflow-hidden rounded-lg border border-[#c89b3c]/36 bg-[linear-gradient(180deg,rgba(20,28,42,.9),rgba(8,12,20,.92))] p-2.5 shadow-[0_12px_30px_rgba(0,0,0,.24),inset_0_1px_0_rgba(255,255,255,.05)]">
        <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{view === "tft-recipe" ? "TFT Recipe" : "TFT Connections"}</div>
            <div className="mt-0.5 text-[11px] text-[color:var(--muted)]">Reset {formatTftReset(resetCountdown)} · Set {daily.setNumber} · Patch {daily.dataDragonVersion}</div>
          </div>
          <span className="shrink-0 rounded-full border border-[#c89b3c]/35 bg-[#c89b3c]/12 px-2 py-1 text-[10px] font-bold uppercase text-[#f2d36b]">
            {stats.rank} · {rankProgress.lp} LP
          </span>
        </div>
      </section>
    </div>
  );
}

function TftSidebar({
  daily,
  view,
  resetCountdown,
  stats,
  rankProgress,
  onAuthChange
}: {
  daily: TftDailyResponse;
  view: TftMode;
  resetCountdown: string;
  stats: UserStats;
  rankProgress: ReturnType<typeof nextRankProgress>;
  onAuthChange: () => void;
}) {
  return (
    <aside className="relative hidden h-[calc(100dvh-1rem)] self-start overflow-hidden border-l border-[#c89b3c]/20 bg-[radial-gradient(circle_at_20%_0%,rgba(45,212,191,.12),transparent_26%),linear-gradient(180deg,#101620_0%,#070a0f_48%,#050607_100%)] p-3 shadow-[-28px_0_90px_rgba(0,0,0,.45)] lg:sticky lg:top-2 lg:flex lg:flex-col lg:gap-3">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f5c542]/60 to-transparent" />
      <div className="relative">
        <h1 className="font-display text-2xl font-black tracking-normal text-[color:var(--gold-bright)] drop-shadow-[0_0_18px_rgba(245,197,66,.18)]">TFT</h1>
        <div className="mt-1 text-[11px] text-[color:var(--muted)]">Reset {formatTftReset(resetCountdown)} · Patch {daily.dataDragonVersion}</div>
      </div>
      <div className="relative flex min-h-0 flex-col gap-2 overflow-y-auto pr-1 pb-1 fine-scrollbar">
        <TftPlayerSidebarGroup stats={stats} progress={rankProgress} />
        <TftSidebarGroup title="Current Set" accent>
          <div className="flex items-center justify-between gap-3">
            <div className="font-display text-3xl font-black text-white">Set {daily.setNumber}</div>
            <div className="rounded-full border border-[#c89b3c]/35 bg-[#c89b3c]/12 px-3 py-1 text-xs font-bold uppercase text-[#f2d36b]">Live</div>
          </div>
        </TftSidebarGroup>
        <TftSidebarGroup title="Mode">
          <div className="text-base font-semibold text-white">{view === "tft-recipe" ? "Item Recipe" : "Unit Connections"}</div>
          <div className="text-sm text-[color:var(--muted)]">{view === "tft-recipe" ? "Current patch craftable TFT items." : "Hidden current-set unit groups."}</div>
        </TftSidebarGroup>
        <AuthPanel onAuthChange={onAuthChange} />
      </div>
    </aside>
  );
}

function TftPlayerSidebarGroup({ stats, progress }: { stats: UserStats; progress: ReturnType<typeof nextRankProgress> }) {
  const lpDelta = progress.lastLpChange;
  const recordLine = stats.rankedGamesPlayed > 0 ? `${stats.rankedWins}W / ${stats.rankedGamesPlayed}G` : stats.gamesPlayed > 0 ? `${stats.wins}W / ${stats.gamesPlayed}G` : "No games yet";

  return (
    <TftSidebarGroup title="Player" accent>
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 truncate text-base font-semibold text-white" title={stats.username}>{stats.username}</div>
          <span className="shrink-0 text-[11px] text-[color:var(--muted)]">{recordLine}</span>
        </div>
      </div>

      <div className="relative overflow-hidden border-t border-white/8 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-display text-2xl font-black leading-none text-white" title={stats.rank}>{stats.rank}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className="font-display text-lg font-bold text-[#f5c542]">{progress.lp} LP</div>
              {typeof lpDelta === "number" && (
                <div className={cn("text-xs font-bold", lpDelta >= 0 ? "text-green-300" : "text-red-300")}>
                  {lpDelta > 0 ? "+" : ""}
                  {lpDelta} LP
                </div>
              )}
            </div>
          </div>
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#c89b3c]/35 bg-[#c89b3c]/12 text-[#f5c542] shadow-[0_0_24px_rgba(245,197,66,.14)]">
            <Trophy size={22} />
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-1.5 rounded-full bg-[#f5c542] transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="mt-1.5 text-[11px] text-[color:var(--muted)]">
          {stats.rank === "Unranked"
            ? "Play TFT modes to place into Iron IV."
            : progress.nextRank
              ? `Reach ${progress.nextPoints} LP to promote to ${progress.nextRank}`
              : "Peak rank unlocked"}
        </div>
      </div>

      <div className="border-t border-white/8 pt-3">
        <div className="grid grid-cols-3 gap-2">
          <TftProgressStat label="Streak" value={String(stats.currentStreak)} />
          <TftProgressStat label="Best" value={String(stats.maxStreak)} />
          <TftProgressStat label="Winrate" value={`${stats.winRate}%`} />
        </div>
      </div>
    </TftSidebarGroup>
  );
}

function TftSidebarGroup({ title, children, accent = false }: { title: string; children: ReactNode; accent?: boolean }) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border bg-[linear-gradient(180deg,rgba(16,24,36,.84),rgba(7,10,15,.9))] p-3 shadow-[0_18px_50px_rgba(0,0,0,.26),inset_0_1px_0_rgba(255,255,255,.045)]",
        accent ? "border-[#c89b3c]/30" : "border-white/10"
      )}
    >
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/16 to-transparent" />
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.1em] text-[#c89b3c]">{title}</div>
      <div className="mt-2.5 grid gap-3">{children}</div>
    </section>
  );
}

function TftProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-xl font-bold leading-none">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-[0.06em] text-[color:var(--muted)]">{label}</div>
    </div>
  );
}

interface TftRankedRecordOptions {
  performanceQuality?: number;
  roundId?: string;
  metadata?: Record<string, unknown>;
}

function useTftModeProgress(gameKey: TftGameKey, username: string, onStatsChange: () => void) {
  const storageKey = `rift-daily:${gameKey}:${normalizeTftStorageName(username || "guest")}`;
  const [streak, setStreak] = useState({ current: 0, best: 0, played: 0, wins: 0 });
  const streakRef = useRef(streak);

  useEffect(() => {
    streakRef.current = streak;
  }, [streak]);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    const fallback = { current: 0, best: 0, played: 0, wins: 0 };

    if (!raw) {
      streakRef.current = fallback;
      setStreak(fallback);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { current: number; best: number; played: number; wins?: number };
      const next = { current: parsed.current, best: parsed.best, played: parsed.played, wins: parsed.wins ?? 0 };
      streakRef.current = next;
      setStreak(next);
    } catch {
      streakRef.current = fallback;
      setStreak(fallback);
    }
  }, [storageKey]);

  function record(won: boolean, options: TftRankedRecordOptions = {}) {
    const performanceQuality = Math.max(0, Math.min(1, options.performanceQuality ?? (won ? 0.75 : 0.25)));
    const roundId = options.roundId ?? `${gameKey}:${Date.now()}`;
    const lpDelta = calculateLpDelta({ won });
    const current = streakRef.current;
    const nextCurrent = won ? current.current + 1 : 0;
    const next = {
      current: nextCurrent,
      best: Math.max(current.best, nextCurrent),
      played: current.played + 1,
      wins: current.wins + (won ? 1 : 0)
    };

    streakRef.current = next;
    setStreak(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    updateTftLocalRankState(username, won, performanceQuality, lpDelta);
    window.dispatchEvent(new Event(tftStreakUpdateEventName));
    onStatsChange();

    void persistTftRankedResult(gameKey, username, won, performanceQuality, lpDelta, roundId, options.metadata);
  }

  return [streak, record] as const;
}

function updateTftLocalRankState(username: string, won: boolean, performanceQuality: number, lpDelta: number) {
  if (typeof window === "undefined") {
    return;
  }

  const key = rankedStorageKey(username);
  const current = parseLeagueRankState(window.localStorage.getItem(key)) ?? createInitialRankState();
  const next = applyRankedResult(current, { won, performanceQuality, lpDelta });
  const promotion = getRankPromotionDetail(current, next);
  window.localStorage.setItem(key, JSON.stringify(next));

  if (promotion) {
    window.dispatchEvent(new CustomEvent(rankPromotionEventName, { detail: promotion }));
  }
}

async function persistTftRankedResult(
  gameKey: TftGameKey,
  username: string,
  won: boolean,
  performanceQuality: number,
  lpDelta: number,
  roundId: string,
  metadata?: Record<string, unknown>
) {
  if (typeof window === "undefined" || username.trim().toLowerCase() === "guest") {
    return;
  }

  try {
    const response = await fetch("/api/ranked/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameKey,
        roundId,
        won,
        performanceQuality,
        lpDelta,
        metadata
      })
    });

    if (response.ok) {
      const body = (await response.json()) as { rankState?: unknown };

      if (body.rankState) {
        window.localStorage.setItem(rankedStorageKey(username), JSON.stringify(body.rankState));
      }

      window.dispatchEvent(new Event(tftStreakUpdateEventName));
    }
  } catch {
    // Signed-in stats sync on the next successful submission.
  }
}

function useTftRankedStats(stats: UserStats): UserStats {
  const [rankedStats, setRankedStats] = useState<UserStats>(() => mergeTftStatsWithLocalStreaks(stats));

  const refresh = useCallback(() => {
    setRankedStats(mergeTftStatsWithLocalStreaks(stats));
  }, [stats]);

  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(tftStreakUpdateEventName, refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(tftStreakUpdateEventName, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return rankedStats;
}

function mergeTftStatsWithLocalStreaks(stats: UserStats): UserStats {
  const serverRankState = tftRankStateFromStats(stats);

  if (typeof window === "undefined" || !isGuestTftUsername(stats.username)) {
    return {
      ...stats,
      rank: displayRankName(serverRankState),
      rankTier: serverRankState.tier,
      rankDivision: serverRankState.division,
      rankLp: serverRankState.lp,
      lastLpChange: serverRankState.lastLpChange,
      rankedGamesPlayed: serverRankState.gamesPlayed,
      rankedWins: serverRankState.wins
    };
  }

  const localStreaks = readTftLocalModeStreaks(stats.username);
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
    rank: displayRankName(localRankState),
    rankTier: localRankState.tier,
    rankDivision: localRankState.division,
    rankLp: localRankState.lp,
    lastLpChange: localRankState.lastLpChange,
    rankedGamesPlayed: localRankState.gamesPlayed,
    rankedWins: localRankState.wins
  };
}

function tftRankStateFromStats(stats: UserStats): LeagueRankState {
  return normalizeRankState({
    tier: stats.rankTier ?? stats.rank,
    division: stats.rankDivision,
    lp: stats.rankLp ?? 0,
    lastLpChange: stats.lastLpChange ?? null,
    gamesPlayed: stats.rankedGamesPlayed ?? stats.gamesPlayed,
    wins: stats.rankedWins ?? stats.wins
  });
}

function readTftLocalModeStreaks(username: string) {
  if (typeof window === "undefined") {
    return [];
  }

  return (["tft-recipe", "tft-connections"] as const)
    .map((mode) => {
      const raw = window.localStorage.getItem(`rift-daily:${mode}:${normalizeTftStorageName(username || "guest")}`);

      if (!raw) {
        return null;
      }

      try {
        const parsed = JSON.parse(raw) as { current: number; best: number; played: number; wins?: number };

        return {
          current: Math.max(0, Math.round(parsed.current ?? 0)),
          best: Math.max(0, Math.round(parsed.best ?? 0)),
          played: Math.max(0, Math.round(parsed.played ?? 0)),
          wins: Math.max(0, Math.round(parsed.wins ?? 0))
        };
      } catch {
        return null;
      }
    })
    .filter((streak): streak is { current: number; best: number; played: number; wins: number } => Boolean(streak));
}

function isGuestTftUsername(username: string) {
  return username.trim().toLowerCase() === "guest";
}

function normalizeTftStorageName(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function useTftResetCountdown(resetAt?: string): string {
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

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatTftReset(value: string) {
  const [hours, minutes] = value.split(":");
  return `${Number(hours)}h ${Number(minutes)}m`;
}

function toSortedKey(values: string[]) {
  return [...values].sort().join("|");
}
