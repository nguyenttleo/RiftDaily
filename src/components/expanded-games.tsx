"use client";

import { ArrowRight, CheckCircle2, CircleSlash, Copy, PackageSearch, Split, Swords, TrendingUp, UsersRound, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  applyRankedResult,
  calculateLpDelta,
  createInitialRankState,
  getRankPromotionDetail,
  parseLeagueRankState,
  rankPromotionEventName,
  rankedStorageKey
} from "@/game/scoring";
import { BUILD_SHARE_PARAM, decodeBuildShareValue, encodeBuildShareCode } from "@/lib/build-share";
import { splitRiotId } from "@/lib/riot-id";
import { cn } from "@/lib/utils";
import type {
  ChampionMatchupChallenge,
  ChampionMatchupRound,
  DodgeQueueChallenge,
  DodgeQueueRound,
  GameItem,
  GuessEloChallenge,
  GuessEloRound,
  ItemBuildChallenge,
  ItemRecipeChallenge,
  OptionItem,
  PublicChampion,
  SummonerSpellRef,
  VerifiedMatchData
} from "@/types";

const BUILD_MAX_GUESSES = 6;
const BUILD_RELEVANT_ITEM_LIMIT = 24;
const BUILD_CHAMPION_NAME_DEFAULT_FONT_REM = 1.5;
const BUILD_CHAMPION_NAME_MIN_FONT_REM = 0.9;
const INFINITE_ROUNDS = 48;
type ItemGuessResult = "correct" | "wrong";

export function ItemBuildGame({
  challenge,
  items = [],
  username = "Guest",
  pageRail = false,
  onNeedMoreRounds
}: {
  challenge: ItemBuildChallenge;
  items?: GameItem[];
  username?: string;
  pageRail?: boolean;
  onNeedMoreRounds?: () => void;
}) {
  const generatedRounds = useMemo(() => createBuildRounds(challenge), [challenge]);
  const randomizedBuildRounds = useRandomizedRounds(generatedRounds, "item-build", username, undefined, undefined, buildRoundFirstKey);
  const rounds = useMemo(() => orderBuildRoundsAvoidingConsecutiveRepeats(randomizedBuildRounds), [randomizedBuildRounds]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedBoots, setSelectedBoots] = useState("");
  const [guesses, setGuesses] = useState<Array<{ items: string[]; boots: string }>>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [skipWarningOpen, setSkipWarningOpen] = useState(false);
  const [matchDataExpanded, setMatchDataExpanded] = useState(false);
  const [choiceShuffleSeed, setChoiceShuffleSeed] = useState(() => createClientShuffleSeed(username));
  const [sharedBuildRoundId, setSharedBuildRoundId] = useState("");
  const viewportRestoreRef = useRef<number | null>(null);
  const [streak, recordStreak] = usePersonalModeStreak("item-build", username);
  const requestMoreRoundsIfExhausted = useRequestMoreRoundsOnExhaustion(rounds.length, onNeedMoreRounds);
  const rawRound = rounds[roundIndex % rounds.length];
  const hydratedRound = useMemo(() => hydrateItemBuildRound(rawRound, items), [items, rawRound]);
  const round = useMemo(() => normalizeBuildBootRoundForRole(hydratedRound), [hydratedRound]);
  const answerSet = useMemo(() => new Set(round.answerItemIds), [round.answerItemIds]);
  const solved = guesses.some((guess) => isBuildGuessSolved(guess, answerSet, round.answerBootsId));
  const finished = solved || guesses.length >= BUILD_MAX_GUESSES;
  const ready = selectedItems.length === 5 && Boolean(selectedBoots);
  const possibleItems = useMemo(() => selectRelevantBuildItems(round, round.possibleItems), [round]);
  const possibleBoots = useMemo(() => selectBuildBootChoicesForRole(round, round.possibleBoots), [round]);
  const randomizedPossibleItems = useMemo(() => seededShuffle(possibleItems, `${choiceShuffleSeed}:${round.id}:possible-items`), [choiceShuffleSeed, round.id, possibleItems]);
  const randomizedPossibleBoots = useMemo(() => seededShuffle(possibleBoots, `${choiceShuffleSeed}:${round.id}:possible-boots`), [choiceShuffleSeed, round.id, possibleBoots]);
  const lockedBuildResults = useMemo(() => {
    const results = new Map<string, ItemGuessResult>();

    for (const guess of guesses) {
      for (const itemId of guess.items) {
        results.set(itemId, answerSet.has(itemId) ? "correct" : "wrong");
      }

      results.set(guess.boots, guess.boots === round.answerBootsId ? "correct" : "wrong");
    }

    return results;
  }, [answerSet, round.answerBootsId, guesses]);
  const unavailableReason = getBuildUnavailableReason(round);
  const missedGuesses = guesses.filter((guess) => !isBuildGuessSolved(guess, answerSet, round.answerBootsId)).length;
  const revealedEnemyCount = finished ? 5 : Math.min(5, missedGuesses);
  const sharedBuildActive = sharedBuildRoundId === round.id;

  useEffect(() => {
    const syncSharedBuildRound = () => {
      setSharedBuildRoundId(getBuildShareRoundIdFromUrl());
    };

    syncSharedBuildRound();
    window.addEventListener("popstate", syncSharedBuildRound);

    return () => {
      window.removeEventListener("popstate", syncSharedBuildRound);
    };
  }, []);

  useEffect(() => {
    if (!sharedBuildRoundId || rounds.length === 0) {
      return;
    }

    const targetIndex = rounds.findIndex((candidate) => candidate.id === sharedBuildRoundId);

    if (targetIndex < 0) {
      return;
    }

    setRoundIndex((current) => (current === targetIndex ? current : targetIndex));
    setSelectedItems([]);
    setSelectedBoots("");
    setGuesses([]);
    setModalOpen(false);
    setSkipWarningOpen(false);
    setMatchDataExpanded(false);
  }, [rounds, sharedBuildRoundId]);

  useLayoutEffect(() => {
    const targetScroll = viewportRestoreRef.current;

    if (targetScroll === null) {
      return;
    }

    viewportRestoreRef.current = null;
    restoreWindowScroll(targetScroll);
    window.requestAnimationFrame(() => restoreWindowScroll(targetScroll));
  }, [round.id]);

  function toggleItem(id: string) {
    if (finished) {
      return;
    }

    setSelectedItems((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      if (current.length >= 5) {
        return current;
      }

      return [...current, id];
    });
  }

  function chooseBoots(id: string) {
    if (!finished) {
      setSelectedBoots(id);
    }
  }

  function clearCurrentGuess() {
    setSelectedItems([]);
    setSelectedBoots("");
  }

  function nextBuild({ preserveViewport = false }: { preserveViewport?: boolean } = {}) {
    if (preserveViewport) {
      prepareBuildViewportRestore(viewportRestoreRef);
    }

    if (sharedBuildRoundId) {
      clearBuildShareParamFromUrl();
      setSharedBuildRoundId("");
    }

    setRoundIndex((current) => {
      const nextIndex = current + 1;
      requestMoreRoundsIfExhausted(nextIndex);
      return nextIndex;
    });
    setSelectedItems([]);
    setSelectedBoots("");
    setGuesses([]);
    setModalOpen(false);
    setSkipWarningOpen(false);
    setMatchDataExpanded(false);
    setChoiceShuffleSeed(createClientShuffleSeed(username));
  }

  function skipBuild() {
    if (finished) {
      return;
    }

    if (streak.current > 0) {
      setSkipWarningOpen(true);
      return;
    }

    confirmSkipBuild();
  }

  function confirmSkipBuild() {
    recordStreak(false, {
      performanceQuality: 0,
      roundId: `${round.id}:skipped`,
      metadata: {
        champion: round.champion.name,
        skipped: true
      }
    });
    nextBuild({ preserveViewport: true });
  }

  function removeItem(id: string) {
    if (!finished) {
      setSelectedItems((current) => current.filter((item) => item !== id));
    }
  }

  function removeBoots() {
    if (!finished) {
      setSelectedBoots("");
    }
  }

  function submitBuild() {
    if (!ready || finished) {
      return;
    }

    const guess = { items: selectedItems, boots: selectedBoots };
    const nextGuesses = [...guesses, guess];
    const nextSolved = isBuildGuessSolved(guess, answerSet, round.answerBootsId);

    setGuesses(nextGuesses);
    setSelectedItems([]);
    setSelectedBoots("");

    if (nextSolved || nextGuesses.length >= BUILD_MAX_GUESSES) {
      recordStreak(nextSolved, {
        performanceQuality: buildPerformanceQuality(nextSolved, nextGuesses, answerSet, round.answerBootsId),
        roundId: round.id,
        metadata: {
          champion: round.champion.name,
          guesses: nextGuesses.length,
          correctSlots: Math.max(...nextGuesses.map((row) => buildGuessCorrectCount(row, answerSet, round.answerBootsId)))
        }
      });
      setModalOpen(true);
    }
  }

  if (unavailableReason) {
    return (
      <section className="play-area-depth min-h-[calc(100dvh-5rem)] rounded-lg border border-[#3c3421] p-2 pb-16 sm:p-4 lg:rounded-sm">
        <div className="play-area-content">
          <VerifiedDataUnavailable reason={unavailableReason} />
        </div>
      </section>
    );
  }

  const leftRail = (
    <aside
      className={cn(
        "min-w-0",
        pageRail
          ? "xl:sticky xl:top-2 xl:col-start-1 xl:row-start-1 xl:row-span-2 xl:h-[calc(100dvh-1rem)] xl:self-start xl:overflow-hidden"
          : "xl:sticky xl:top-3 xl:max-h-[calc(100dvh-1.5rem)] xl:self-start xl:overflow-y-auto xl:pr-1 fine-scrollbar"
      )}
    >
      <div
        className={cn(
          "relative grid w-full gap-2 rounded-xl border border-[#c89b3c]/24 bg-[radial-gradient(circle_at_22%_0%,rgba(200,155,60,.13),transparent_30%),linear-gradient(180deg,rgba(15,24,37,.96),rgba(6,11,18,.98))] p-2.5 shadow-[0_28px_90px_rgba(0,0,0,.42),inset_0_1px_0_rgba(255,255,255,.07)] sm:gap-3 sm:p-4 xl:rounded-lg",
          pageRail ? "xl:h-full xl:content-start xl:overflow-y-auto xl:overflow-x-hidden xl:pr-2 rail-scrollbar" : "overflow-hidden"
        )}
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/22 to-transparent" />
        <div className="pointer-events-none absolute -right-20 top-20 h-44 w-44 rounded-full bg-[#c89b3c]/10 blur-3xl" />
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <span className="text-[#c89b3c]">
            <PackageSearch size={18} />
          </span>
          <h2 className="text-lg font-semibold sm:text-xl">Guess the Build</h2>
        </div>
        <div className="hidden sm:block">
          <InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />
        </div>
        <BuildTargetCard
          round={round}
          revealedEnemyCount={revealedEnemyCount}
          currentGuess={Math.min(guesses.length + 1, BUILD_MAX_GUESSES)}
          maxGuesses={BUILD_MAX_GUESSES}
        />
        <div className="grid gap-2">
          <BuildTeamScout title="Ally Team" picks={round.allyTeam ?? []} targetPlayerName={round.targetPlayerName} />
          <BuildTeamScout title="Enemy Intel" picks={round.enemyPlayers ?? []} revealCount={revealedEnemyCount} hidden />
        </div>
      </div>
    </aside>
  );

  const gameContent = (
    <div className="play-area-content grid gap-3">
      <div className="play-panel-depth grid gap-2 rounded-sm border border-[#3c3421] p-2 sm:p-3">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-base font-extrabold tracking-tight text-white sm:text-xl">
              Guess {round.targetPlayerName ?? "the Challenger winner"}&apos;s final build.
            </div>
            <div className="mt-1 text-xs text-[color:var(--muted)] sm:text-sm">
              {sharedBuildActive ? "Shared build loaded. Your friend will see this exact round." : "Missed guesses reveal enemy players one at a time."}
            </div>
          </div>
          <BuildShareButtons roundId={round.id} />
        </div>
        {Array.from({ length: BUILD_MAX_GUESSES }).map((_, index) => {
          const guess = guesses[index];
          const active = !guess && index === guesses.length && !finished;

          return (
            <BuildWordleRow
              key={index}
              guess={guess}
              active={active}
              selectedItems={selectedItems}
              selectedBoots={selectedBoots}
              possibleItems={randomizedPossibleItems}
              possibleBoots={randomizedPossibleBoots}
              answerSet={answerSet}
              answerBootsId={round.answerBootsId}
              onRemoveItem={removeItem}
              onRemoveBoots={removeBoots}
            />
          );
        })}
      </div>

      <div className="grid items-stretch gap-2 xl:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="play-inset-panel-depth flex h-full min-h-0 flex-col rounded-sm border border-white/10 p-2 sm:p-3">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="font-display text-base font-extrabold tracking-tight text-[#c89b3c] sm:text-xl">Possible Items</span>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-3 content-stretch gap-2 px-0.5 pb-3 pt-1.5 sm:grid-cols-3 sm:px-1 sm:pb-4 sm:pt-2 md:auto-rows-fr md:grid-cols-4">
            {randomizedPossibleItems.map((item) => (
              <ItemChoiceCard
                key={item.id}
                item={item}
                selected={selectedItems.includes(item.id)}
                result={lockedBuildResults.get(item.id)}
                disabled={finished || (!selectedItems.includes(item.id) && selectedItems.length >= 5)}
                onClick={() => toggleItem(item.id)}
              />
            ))}
          </div>
        </div>
        <div className="play-inset-panel-depth flex h-full flex-col rounded-sm border border-white/10 p-2 sm:p-3">
          <div className="font-display mb-1.5 text-base font-extrabold tracking-tight text-[#c89b3c] sm:text-xl">Boots</div>
          <div className="grid grid-cols-2 content-start gap-1.5 px-0.5 pb-3 pt-1.5 sm:grid-cols-3 sm:gap-2 sm:px-1 sm:pb-4 sm:pt-2 xl:min-h-0 xl:flex-1 xl:auto-rows-fr xl:grid-cols-1">
            {randomizedPossibleBoots.map((item) => (
              <BootChoiceCard
                key={item.id}
                item={item}
                selected={selectedBoots === item.id}
                result={lockedBuildResults.get(item.id)}
                disabled={finished}
                onClick={() => chooseBoots(item.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="sticky bottom-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0b111b]/96 p-2 shadow-[0_18px_50px_rgba(0,0,0,.35)] backdrop-blur lg:static lg:rounded-sm lg:p-3 lg:shadow-none">
        {!finished && (
          <Button type="button" variant="danger" onClick={skipBuild}>
            Skip
          </Button>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {!finished && (
            <Button type="button" variant="secondary" onClick={clearCurrentGuess} disabled={selectedItems.length === 0 && !selectedBoots}>
              Clear Guess
            </Button>
          )}
          {finished && round.sourceMatch && (
            <MatchDataToggleButton expanded={matchDataExpanded} onClick={() => setMatchDataExpanded((current) => !current)} />
          )}
          <Button
            type="button"
            onClick={submitBuild}
            disabled={!ready || finished}
            className={cn(ready && !finished && "shadow-[0_0_20px_rgba(245,197,66,.18)]")}
          >
            Lock Guess
          </Button>
          {finished && (
            <NextLobbyButton onClick={nextBuild} label="Next build" />
          )}
        </div>
      </div>
      {finished && matchDataExpanded && <MatchProofCard sourceMatch={round.sourceMatch} />}
    </div>
  );

  const modal = modalOpen ? (
    <BuildWordleModal
      round={round}
      guesses={guesses}
      solved={solved}
      streak={streak}
      onClose={() => setModalOpen(false)}
      onNext={nextBuild}
    />
  ) : null;
  const skipModal = skipWarningOpen ? (
    <SkipBuildWarningModal
      streak={streak.current}
      onCancel={() => setSkipWarningOpen(false)}
      onConfirm={confirmSkipBuild}
    />
  ) : null;

  if (pageRail) {
    return (
      <>
        {leftRail}
        <section className="play-area-depth min-h-[calc(100dvh-5rem)] rounded-lg border border-[#3c3421] p-2 pb-16 [overflow-anchor:none] sm:p-4 lg:rounded-sm xl:col-start-2 xl:row-start-2 xl:min-h-[calc(100dvh-5.25rem)]">
          {gameContent}
          {modal}
          {skipModal}
        </section>
      </>
    );
  }

  return (
    <section className="play-area-depth min-h-[calc(100dvh-5rem)] rounded-lg border border-[#3c3421] p-2 pb-16 [overflow-anchor:none] sm:p-4 lg:rounded-sm">
      <div className="grid items-start gap-2 sm:gap-4 xl:grid-cols-[minmax(18rem,30%)_minmax(0,1fr)]">
        {leftRail}
        {gameContent}
      </div>
      {modal}
      {skipModal}
    </section>
  );
}

function BuildTargetCard({
  round,
  revealedEnemyCount,
  currentGuess,
  maxGuesses
}: {
  round: ItemBuildChallenge;
  revealedEnemyCount: number;
  currentGuess: number;
  maxGuesses: number;
}) {
  const [liveLp, setLiveLp] = useState<number | null>(null);
  const [lpLoading, setLpLoading] = useState(false);
  const displayedLp = typeof round.targetPlayerLp === "number" ? round.targetPlayerLp : liveLp;

  useEffect(() => {
    setLiveLp(null);

    if (typeof round.targetPlayerLp === "number" || !round.targetPlayerName?.includes("#")) {
      setLpLoading(false);
      return;
    }

    let cancelled = false;
    const platform = round.sourceMatch?.platform;

    async function loadLp() {
      setLpLoading(true);

      try {
        const query = new URLSearchParams({
          riotId: round.targetPlayerName ?? ""
        });

        if (platform) {
          query.set("platform", platform);
        }

        const response = await fetch(`/api/ranked/lp?${query.toString()}`, { cache: "force-cache" });
        const body = (await response.json()) as { leaguePoints?: number };

        if (!cancelled && response.ok && typeof body.leaguePoints === "number") {
          setLiveLp(body.leaguePoints);
        }
      } catch {
        // LP is cosmetic for the puzzle surface; the verified match data remains authoritative.
      } finally {
        if (!cancelled) {
          setLpLoading(false);
        }
      }
    }

    void loadLp();

    return () => {
      cancelled = true;
    };
  }, [round.sourceMatch?.platform, round.targetPlayerLp, round.targetPlayerName]);

  return (
    <div className="relative min-h-[16rem] overflow-hidden rounded-xl border border-[#74ecff]/18 bg-[linear-gradient(135deg,rgba(10,22,34,.96),rgba(5,7,11,.92)_62%)] p-3 shadow-[0_18px_50px_rgba(0,0,0,.30),inset_0_1px_0_rgba(255,255,255,.065)]">
      <div
        className="absolute inset-0 bg-cover opacity-[0.36]"
        style={{
          backgroundImage: `url(${round.champion.splashUrl})`,
          backgroundPosition: championSplashPosition(round.champion.name)
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,11,.94),rgba(5,7,11,.78)_55%,rgba(5,7,11,.52)),radial-gradient(circle_at_82%_18%,rgba(116,236,255,.16),transparent_32%)]" />
      <div className="relative grid gap-3">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={round.champion.squareUrl} alt="" className="h-14 w-14 rounded-lg border border-[#c89b3c]/35 object-cover shadow-[0_10px_22px_rgba(0,0,0,.35)]" />
          <div className="min-w-0">
            <BuildChampionName name={round.champion.name} />
            {round.targetRole && (
              <div className="mt-1 w-fit rounded-sm border border-[#c89b3c]/35 bg-[#c89b3c]/12 px-2 py-0.5 text-[10px] font-bold uppercase leading-none text-[#c89b3c]">
                {displayLaneLabel(round.targetRole)}
              </div>
            )}
          </div>
          <div className="grid min-w-[5rem] justify-items-center gap-1">
            <RankEmblemMini rankTier="Challenger" />
            {typeof displayedLp === "number" ? (
              <div className="rounded-full border border-[#74ecff]/24 bg-[#061c27]/82 px-2.5 py-1 text-center font-display text-sm font-black leading-none text-[#d8fbff] shadow-[0_6px_16px_rgba(0,0,0,.24),inset_0_1px_0_rgba(255,255,255,.08)]">
                {displayedLp} LP
              </div>
            ) : lpLoading ? (
              <div className="rounded-full border border-[#74ecff]/18 bg-[#061c27]/60 px-2.5 py-1 font-display text-[10px] font-black uppercase tracking-[0.08em] text-[#74ecff]/70">LP</div>
            ) : null}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#050607]/72 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#74ecff]/72">Player</div>
          <div className="mt-1 whitespace-normal break-words text-sm font-bold leading-snug text-[#d7e6ff] [overflow-wrap:anywhere]" title={round.targetPlayerName}>
            <BuildPlayerName name={round.targetPlayerName} fallback="Verified Challenger" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-2">
            <div className="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[#9fb7d5]">Enemy intel</div>
            <div className="mt-1 font-display text-lg font-black leading-none text-[#f2d36b]">{revealedEnemyCount}/5</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-2">
            <div className="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-[#9fb7d5]">Guess</div>
            <div className="mt-1 font-display text-lg font-black leading-none text-white">{currentGuess}/{maxGuesses}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BuildChampionName({ name }: { name: string }) {
  const nameRef = useRef<HTMLDivElement>(null);
  const isSingleWord = !/\s/.test(name.trim());

  useLayoutEffect(() => {
    const element = nameRef.current;

    if (!element) {
      return undefined;
    }

    if (!isSingleWord) {
      element.style.fontSize = "";
      return undefined;
    }

    let frame: number | null = null;
    let cancelled = false;

    const fitName = () => {
      frame = null;
      element.style.fontSize = `${BUILD_CHAMPION_NAME_DEFAULT_FONT_REM}rem`;

      if (element.clientWidth <= 0 || element.scrollWidth <= element.clientWidth) {
        return;
      }

      const nextFontSize = Math.max(
        BUILD_CHAMPION_NAME_MIN_FONT_REM,
        BUILD_CHAMPION_NAME_DEFAULT_FONT_REM * (element.clientWidth / element.scrollWidth) * 0.98
      );

      element.style.fontSize = `${Number(nextFontSize.toFixed(3))}rem`;
    };

    const scheduleFit = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      frame = requestAnimationFrame(() => {
        if (!cancelled) {
          fitName();
        }
      });
    };

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleFit) : null;

    scheduleFit();
    resizeObserver?.observe(element);
    window.addEventListener("resize", scheduleFit);
    void document.fonts?.ready.then(scheduleFit).catch(() => undefined);

    return () => {
      cancelled = true;

      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleFit);
      element.style.fontSize = "";
    };
  }, [isSingleWord, name]);

  return (
    <div
      ref={nameRef}
      className={cn(
        "max-w-full font-display text-2xl font-bold leading-[1.02] text-white",
        isSingleWord ? "whitespace-nowrap" : "whitespace-normal break-words [overflow-wrap:anywhere] [text-wrap:balance]"
      )}
      title={name}
    >
      {name}
    </div>
  );
}

function RankEmblemMini({ rankTier }: { rankTier: string }) {
  return (
    <span className="relative h-[4.35rem] w-[5.35rem] shrink-0 bg-transparent">
      <span className="pointer-events-none absolute left-1/2 top-[43%] h-14 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(116,236,255,.18)_0%,rgba(116,236,255,.085)_44%,rgba(116,236,255,.025)_66%,transparent_82%)] blur-md" />
      <span className="absolute inset-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={rankEmblemUrl(rankTier)}
          alt=""
          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none object-contain opacity-100 saturate-125"
          style={{ width: "22rem", maxWidth: "none", transform: "translate(-50%, -50%)" }}
        />
      </span>
    </span>
  );
}

function rankEmblemUrl(rankTier: string) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${rankTier.toLowerCase()}.png`;
}

function BuildTeamScout({
  title,
  picks,
  revealCount = picks.length,
  targetPlayerName,
  hidden = false
}: {
  title: string;
  picks: NonNullable<ItemBuildChallenge["allyTeam"]>;
  revealCount?: number;
  targetPlayerName?: string;
  hidden?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(10,17,27,.9),rgba(5,7,11,.9))] p-2 shadow-[0_14px_38px_rgba(0,0,0,.24),inset_0_1px_0_rgba(255,255,255,.045)] sm:p-3">
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-display text-[12px] font-black uppercase tracking-[0.14em] text-[#f0d99d] sm:text-sm">{title}</div>
        {hidden && <div className="rounded-full border border-white/10 bg-white/[.035] px-2 py-0.5 font-display text-[10px] font-bold uppercase text-[color:var(--muted)]">{Math.min(revealCount, picks.length)}/{picks.length}</div>}
      </div>
      <div className="grid gap-1.5">
        {picks.map((pick, index) => {
          const revealed = !hidden || index < revealCount;
          const isTarget = !hidden && pick.playerName && targetPlayerName && normalize(pick.playerName) === normalize(targetPlayerName);

          return (
            <div
              key={`${title}:${pick.role}:${pick.champion.id}:${index}`}
              className={cn(
                "grid grid-cols-[2.35rem_minmax(0,1fr)] items-center gap-2 rounded-lg border p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]",
                revealed
                  ? "border-[#26313f] bg-[linear-gradient(180deg,rgba(20,30,44,.92),rgba(12,18,28,.92))]"
                  : "border-white/10 bg-[linear-gradient(180deg,rgba(17,23,34,.64),rgba(8,11,17,.74))]"
              )}
            >
              {revealed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pick.champion.squareUrl} alt="" className="h-9 w-9 rounded-lg border border-[#3c3421] object-cover shadow-[0_7px_16px_rgba(0,0,0,.25)]" />
              ) : (
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-[#050607] font-display text-sm font-black text-[color:var(--muted)]">?</div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 rounded-sm border border-[#c89b3c]/30 bg-[#c89b3c]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-[#c89b3c]">
                    {displayLaneLabel(pick.role)}
                  </span>
                  <span className={cn("truncate text-sm font-bold", !revealed && "text-[color:var(--muted)]")}>{revealed ? pick.champion.name : "Hidden"}</span>
                  {isTarget && <span className="shrink-0 rounded-sm bg-green-400/18 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-200">Target</span>}
                </div>
                <div className="truncate text-[11px] font-semibold text-[#9fb7d5]" title={revealed ? pick.playerName : undefined}>
                  {revealed ? <BuildPlayerName name={pick.playerName} fallback="Unknown player" compact /> : "Reveal after a miss"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BuildPlayerName({ name, fallback, compact = false }: { name?: string; fallback: string; compact?: boolean }) {
  const displayName = name?.trim();

  if (!displayName) {
    return fallback;
  }

  const riotId = splitRiotId(displayName);

  if (!riotId) {
    return displayName;
  }

  return (
    <span className={cn("inline-flex max-w-full items-baseline", compact ? "align-bottom" : "flex-wrap")}>
      <span className={cn("min-w-0", compact ? "truncate" : "break-words [overflow-wrap:anywhere]")}>{riotId.gameName}</span>
      <span className="shrink-0 whitespace-nowrap text-[#74ecff]/85">#{riotId.tagLine}</span>
    </span>
  );
}

function BuildWordleRow({
  guess,
  active,
  selectedItems,
  selectedBoots,
  possibleItems,
  possibleBoots,
  answerSet,
  answerBootsId,
  onRemoveItem,
  onRemoveBoots
}: {
  guess?: { items: string[]; boots: string };
  active: boolean;
  selectedItems: string[];
  selectedBoots: string;
  possibleItems: GameItem[];
  possibleBoots: GameItem[];
  answerSet: Set<string>;
  answerBootsId: string;
  onRemoveItem: (id: string) => void;
  onRemoveBoots: () => void;
}) {
  const itemLookup = new Map([...possibleItems, ...possibleBoots].map((item) => [item.id, item]));

  return (
    <div className="grid grid-cols-6 gap-1 sm:gap-2">
      {Array.from({ length: 5 }).map((_, index) => {
        const itemId = guess?.items[index] ?? (active ? selectedItems[index] : "");
        const item = itemId ? itemLookup.get(itemId) : undefined;

        return (
          <BuildSlot
            key={index}
            item={item}
            submitted={Boolean(guess)}
            correct={Boolean(guess && itemId && answerSet.has(itemId))}
            label={active ? "+ Item" : `Item ${index + 1}`}
            onRemove={!guess && active && itemId ? () => onRemoveItem(itemId) : undefined}
          />
        );
      })}
      {(() => {
        const bootsId = guess?.boots ?? (active ? selectedBoots : "");
        const boots = bootsId ? itemLookup.get(bootsId) : undefined;

        return (
          <BuildSlot
            item={boots}
            submitted={Boolean(guess)}
            correct={Boolean(guess && bootsId === answerBootsId)}
            label={active ? "+ Boots" : "Boots"}
            onRemove={!guess && active && bootsId ? onRemoveBoots : undefined}
          />
        );
      })()}
    </div>
  );
}

function BuildWordleModal({
  round,
  guesses,
  solved,
  streak,
  onClose,
  onNext
}: {
  round: ItemBuildChallenge;
  guesses: Array<{ items: string[]; boots: string }>;
  solved: boolean;
  streak: { current: number; best: number; played: number };
  onClose: () => void;
  onNext: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  useBodyScrollLock();

  const answerSet = new Set(round.answerItemIds);
  const targetItems = round.answerItemIds
    .map((id) => round.possibleItems.find((item) => item.id === id))
    .filter(Boolean) as GameItem[];
  const targetBoots = round.possibleBoots.find((item) => item.id === round.answerBootsId);
  const targetBuild = targetBoots ? [...targetItems, targetBoots] : targetItems;
  const headline = solved ? "Build read." : "Build gap.";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_50%_18%,rgba(200,155,60,.16),transparent_32%),rgba(0,0,0,.76)] p-3 backdrop-blur-md sm:p-4">
      <div
        className={cn(
          "relative grid w-full gap-4 overscroll-contain rounded-3xl border bg-[linear-gradient(180deg,rgba(13,20,31,.98),rgba(5,8,13,.98))] p-3 shadow-[0_30px_110px_rgba(0,0,0,.72),inset_0_1px_0_rgba(255,255,255,.06)] transition-[max-width] sm:p-4",
          expanded
            ? "max-h-[calc(100dvh-1.5rem)] max-w-[min(92rem,calc(100vw-1.5rem))] overflow-y-auto border-[#c89b3c]/70 fine-scrollbar sm:max-h-[calc(100dvh-2rem)] sm:max-w-[min(92rem,calc(100vw-2rem))]"
            : "max-h-[calc(100dvh-1.5rem)] max-w-2xl overflow-y-auto border-[#c89b3c]/55 fine-scrollbar sm:max-h-[calc(100dvh-2rem)]"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={cn("font-display text-3xl font-extrabold", solved ? "text-green-300" : "text-red-200")}>{headline}</div>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {solved ? `Solved in ${guesses.length}/${BUILD_MAX_GUESSES} guesses.` : `The Challenger build dodged all ${BUILD_MAX_GUESSES} guesses.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/5 text-[color:var(--muted)] transition hover:border-[#c89b3c] hover:text-white"
            aria-label="Close result"
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem]">
          <ResultStat label="Current Streak" value={String(streak.current)} detail={`Best ${streak.best}`} tone={solved ? "good" : "muted"} />
          <ResultStat label="Enemy Reveals" value={String(Math.min(5, guesses.length))} detail="5 max" tone="gold" />
        </div>
        <div className="mt-5 grid gap-1.5">
          {guesses.map((guess, rowIndex) => (
            <div key={`${guess.boots}:${rowIndex}`} className="grid grid-cols-6 gap-1 sm:gap-1.5">
              {[...guess.items.map((id) => answerSet.has(id)), guess.boots === round.answerBootsId].map((correct, index) => (
                <div key={index} className={cn("h-8 rounded-md border", correct ? "border-green-300/60 bg-green-500/70" : "border-white/10 bg-[#2b313d]")} />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-5">
          <div className="text-xs uppercase text-[#c89b3c]">Target Build</div>
          <div className="mt-2 grid grid-cols-6 gap-1 sm:gap-2">
            {targetBuild.map((item) => (
              <div key={item.id} className="grid min-h-16 place-items-center rounded-md border border-green-400/45 bg-green-500/12 p-1 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl} alt="" className="h-8 w-8 object-contain" />
                <span className="line-clamp-2 text-[10px] font-semibold leading-tight">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2 rounded-2xl border border-white/8 bg-white/[.035] p-2">
          <BuildShareButtons roundId={round.id} compact />
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          {round.sourceMatch && (
            <MatchDataToggleButton expanded={expanded} onClick={() => setExpanded((current) => !current)} />
          )}
          <Button type="button" onClick={onNext}>
            Next build
          </Button>
        </div>
        {expanded && <MatchProofCard sourceMatch={round.sourceMatch} />}
      </div>
    </div>
  );
}

function SkipBuildWarningModal({
  streak,
  onCancel,
  onConfirm
}: {
  streak: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useBodyScrollLock();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[radial-gradient(circle_at_50%_18%,rgba(239,68,68,.14),transparent_34%),rgba(0,0,0,.72)] p-4 backdrop-blur-md">
      <div className="relative grid w-full max-w-md gap-4 rounded-3xl border border-red-300/35 bg-[linear-gradient(180deg,rgba(22,13,18,.98),rgba(5,8,13,.98))] p-4 shadow-[0_28px_90px_rgba(0,0,0,.68),inset_0_1px_0_rgba(255,255,255,.06)]">
        <div>
          <div className="font-display text-2xl font-extrabold text-red-100">Skip this build?</div>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            Skipping will reset your Build streak from {streak} to 0 and move to the next round.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Keep playing
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>
            Skip and reset streak
          </Button>
        </div>
      </div>
    </div>
  );
}

function isBuildGuessSolved(guess: { items: string[]; boots: string }, answerSet: Set<string>, answerBootsId: string) {
  return guess.items.length === 5 && guess.items.every((id) => answerSet.has(id)) && guess.boots === answerBootsId;
}

function buildGuessCorrectCount(guess: { items: string[]; boots: string }, answerSet: Set<string>, answerBootsId: string) {
  return guess.items.filter((id) => answerSet.has(id)).length + (guess.boots === answerBootsId ? 1 : 0);
}

function buildPerformanceQuality(solved: boolean, guesses: Array<{ items: string[]; boots: string }>, answerSet: Set<string>, answerBootsId: string) {
  if (solved) {
    return Math.max(0, Math.min(1, 1 - ((guesses.length - 1) / Math.max(1, BUILD_MAX_GUESSES - 1))));
  }

  const bestCorrect = Math.max(0, ...guesses.map((guess) => buildGuessCorrectCount(guess, answerSet, answerBootsId)));
  return bestCorrect / 6;
}

function createBuildRounds(base: ItemBuildChallenge) {
  return base.rounds && base.rounds.length > 0 ? base.rounds : [base];
}

function buildRoundFirstKey(round: ItemBuildChallenge) {
  return round.champion.id;
}

function orderBuildRoundsAvoidingConsecutiveRepeats(rounds: ItemBuildChallenge[]) {
  if (rounds.length <= 1) {
    return rounds;
  }

  const remaining = [...rounds];
  const ordered: ItemBuildChallenge[] = [];

  while (remaining.length > 0) {
    const previous = ordered[ordered.length - 1];
    const nextIndex = previous
      ? remaining.findIndex((round) => !isRepeatedBuildRound(previous, round))
      : 0;
    const [next] = remaining.splice(nextIndex >= 0 ? nextIndex : 0, 1);

    if (next) {
      ordered.push(next);
    }
  }

  return ordered;
}

function isRepeatedBuildRound(previous: ItemBuildChallenge, next: ItemBuildChallenge) {
  return (
    previous.champion.id === next.champion.id ||
    Boolean(buildRoundPlayerKey(previous) && buildRoundPlayerKey(previous) === buildRoundPlayerKey(next))
  );
}

function buildRoundPlayerKey(round: ItemBuildChallenge) {
  const playerName = (round.targetPlayerName ?? round.sourceMatch?.sourcePlayer ?? "").trim();

  if (!playerName) {
    return "";
  }

  return normalize(playerName) || playerName.toLowerCase();
}

function createClientShuffleSeed(username: string) {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();

  return `${Date.now()}:${now}:${username}:${randomId}:${Math.random()}`;
}

function prepareBuildViewportRestore(viewportRestoreRef: { current: number | null }) {
  if (typeof window === "undefined") {
    return;
  }

  viewportRestoreRef.current = window.scrollY;
  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }
}

function restoreWindowScroll(targetScroll: number) {
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  window.scrollTo({
    top: Math.min(targetScroll, maxScroll),
    left: window.scrollX,
    behavior: "auto"
  });
}

function BuildShareButtons({ roundId, compact = false }: { roundId: string; compact?: boolean }) {
  const [status, setStatus] = useState("");
  const shareCode = useMemo(() => encodeBuildShareCode(roundId), [roundId]);
  const shareUrl = useMemo(() => buildShareUrl(shareCode), [shareCode]);

  useEffect(() => {
    if (!status) {
      return;
    }

    const timeout = window.setTimeout(() => setStatus(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [status]);

  async function copyShare(kind: "link" | "code") {
    const value = kind === "link" ? shareUrl : shareCode;

    if (!value) {
      return;
    }

    const copied = await copyTextToClipboard(value);
    setStatus(copied ? `Copied ${kind}.` : "Copy failed.");
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-1.5", compact ? "mr-auto" : "shrink-0")}>
      {status && <span className="rounded-full border border-green-300/20 bg-green-400/10 px-2 py-1 text-[10px] font-bold text-green-200">{status}</span>}
      <Button type="button" variant="secondary" icon={<Copy size={14} />} onClick={() => void copyShare("link")} className={compact ? "min-h-9 px-2.5 text-xs" : "min-h-9 px-2.5 text-xs sm:px-3"}>
        Copy link
      </Button>
    </div>
  );
}

function buildShareUrl(shareCode: string) {
  if (typeof window === "undefined" || !shareCode) {
    return "";
  }

  const url = new URL(window.location.origin);
  url.pathname = "/play";
  url.searchParams.set("mode", "item-build");
  url.searchParams.set(BUILD_SHARE_PARAM, shareCode);
  return url.toString();
}

function getBuildShareRoundIdFromUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  return decodeBuildShareValue(new URLSearchParams(window.location.search).get(BUILD_SHARE_PARAM));
}

function clearBuildShareParamFromUrl() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete(BUILD_SHARE_PARAM);
  window.history.replaceState(null, "", url);
}

async function copyTextToClipboard(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to an off-screen textarea below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

const TIER_TWO_BOOT_IDS = new Set(["3006", "3008", "3009", "3020", "3047", "3111", "3158"]);

function getBuildUnavailableReason(round: ItemBuildChallenge) {
  if (round.unavailableReason) {
    return round.unavailableReason;
  }

  if (
    round.enemyPlayers?.length !== 5 ||
    round.allyTeam?.length !== 5 ||
    round.answerItemIds.length !== 5 ||
    !round.answerBootsId ||
    round.possibleItems.length < 5 ||
    round.possibleBoots.length === 0
  ) {
    return "Build needs a verified Challenger ranked win with five completed items and upgraded boots. Keep the live cache warming.";
  }

  return "";
}

function hydrateItemBuildRound(round: ItemBuildChallenge, itemCatalog: GameItem[]): ItemBuildChallenge {
  const itemById = new Map(itemCatalog.map((item) => [item.id, item]));
  const answerItems = round.answerItemIds.map((id) => itemById.get(id)).filter(Boolean) as GameItem[];
  const answerBoots = itemById.get(round.answerBootsId) ?? round.possibleBoots.find((item) => item.id === round.answerBootsId);
  const possibleItems =
    itemCatalog.length > 0 && answerItems.length === round.answerItemIds.length
      ? selectRelevantBuildItems(round, uniqueItemsByName([...answerItems, ...itemCatalog.filter(isBuildCandidateChoice)], new Set(round.answerItemIds)))
      : round.possibleItems;

  if (round.possibleItems.length > 0 && round.possibleBoots.length > 0) {
    const bootCatalog = itemCatalog.length > 0 ? itemCatalog.filter(isUpgradedBootsChoice) : [];

    return {
      ...round,
      possibleItems,
      possibleBoots: answerBoots ? uniqueItemsByName([answerBoots, ...round.possibleBoots, ...bootCatalog], new Set([round.answerBootsId])) : round.possibleBoots
    };
  }

  if (answerItems.length !== 5 || !answerBoots) {
    return round;
  }

  return {
    ...round,
    possibleItems,
    possibleBoots: uniqueItemsByName([answerBoots, ...itemCatalog.filter(isUpgradedBootsChoice)], new Set([round.answerBootsId]))
  };
}

function normalizeBuildBootRoundForRole(round: ItemBuildChallenge): ItemBuildChallenge {
  const answerBoots = round.possibleBoots.find((item) => item.id === round.answerBootsId);

  if (!answerBoots) {
    return {
      ...round,
      possibleBoots: selectBuildBootChoicesForRole(round, round.possibleBoots)
    };
  }

  const isMid = isMidBuildRole(round);
  const tierTwoReplacement = !isMid && isTierThreeBootChoice(answerBoots) ? findTierTwoBootReplacement(answerBoots, round.possibleBoots) : undefined;
  const tierThreeReplacement = isMid && !isTierThreeBootChoice(answerBoots) ? findTierThreeBootReplacement(answerBoots, round.possibleBoots) : undefined;
  const answerBootsId = tierTwoReplacement?.id ?? tierThreeReplacement?.id ?? round.answerBootsId;
  const nextRound = answerBootsId === round.answerBootsId ? round : { ...round, answerBootsId };
  const possibleBoots = selectBuildBootChoicesForRole(nextRound, round.possibleBoots);

  if (nextRound === round && possibleBoots === round.possibleBoots) {
    return round;
  }

  return {
    ...nextRound,
    possibleBoots
  };
}

function selectBuildBootChoicesForRole(round: ItemBuildChallenge, sourceBoots: GameItem[]) {
  const answerBoots = sourceBoots.find((item) => item.id === round.answerBootsId);
  const isMid = isMidBuildRole(round);
  const selectedBoots = sourceBoots.flatMap((item) => {
    if (isMid) {
      if (isTierThreeBootChoice(item)) {
        return [item];
      }

      const tierThreeReplacement = findTierThreeBootReplacement(item, sourceBoots);
      return tierThreeReplacement ? [tierThreeReplacement] : [];
    }

    if (isTierThreeBootChoice(item)) {
      return [];
    }

    return [item];
  });

  return uniqueItemsByName(answerBoots ? [answerBoots, ...selectedBoots] : selectedBoots, new Set([round.answerBootsId]));
}

function isMidBuildRole(round: ItemBuildChallenge) {
  return normalize(round.targetRole ?? "").includes("mid");
}

function isTierThreeBootChoice(item: GameItem) {
  return (
    item.purchasable &&
    item.name !== "Boots" &&
    item.into.length === 0 &&
    item.from.some((id) => TIER_TWO_BOOT_IDS.has(id)) &&
    !item.tags.includes("Consumable") &&
    !item.tags.includes("Trinket")
  );
}

function findTierTwoBootReplacement(tierThreeBoots: GameItem, sourceBoots: GameItem[]) {
  return sourceBoots.find((item) => tierThreeBoots.from.includes(item.id) && isUpgradedBootsChoice(item) && !isTierThreeBootChoice(item));
}

function findTierThreeBootReplacement(tierTwoBoots: GameItem, sourceBoots: GameItem[]) {
  return sourceBoots.find((item) => item.from.includes(tierTwoBoots.id) && isTierThreeBootChoice(item));
}

function selectRelevantBuildItems(round: ItemBuildChallenge, sourceItems: GameItem[]) {
  const answerIds = new Set(round.answerItemIds);
  const uniqueItems = uniqueItemsByName(sourceItems, answerIds).filter((item) => answerIds.has(item.id) || isBuildCandidateChoice(item));
  const answerItems = round.answerItemIds
    .map((id) => uniqueItems.find((item) => item.id === id))
    .filter(Boolean) as GameItem[];

  if (answerItems.length !== round.answerItemIds.length) {
    return uniqueItems;
  }

  const profile = getChampionSpecificBuildProfile(round, answerItems);
  const [minAnswerGold, maxAnswerGold] = answerGoldRange(answerItems);
  const scoredDistractors = uniqueItems
    .filter((item) => !answerIds.has(item.id))
    .map((item) => ({
      item,
      looseScore: buildItemSimilarityScore(item, profile, minAnswerGold, maxAnswerGold),
      score: buildItemRelevanceScore(item, profile, minAnswerGold, maxAnswerGold)
    }));
  const relevantDistractors = scoredDistractors
    .filter(({ score }) => score >= 10)
    .sort((a, b) => b.score - a.score || b.item.goldTotal - a.item.goldTotal || a.item.name.localeCompare(b.item.name))
    .map(({ item }) => item);
  const similarBackfill = scoredDistractors
    .filter(({ score }) => score < 10)
    .sort((a, b) => b.looseScore - a.looseScore || b.score - a.score || b.item.goldTotal - a.item.goldTotal || a.item.name.localeCompare(b.item.name))
    .map(({ item }) => item);

  return fillBuildItemPool(answerItems, [relevantDistractors, similarBackfill], answerIds);
}

interface ChampionSpecificBuildProfile {
  answerTagCounts: Map<string, number>;
  answerTags: Set<string>;
  answerSignalTags: Set<string>;
  primaryTags: Set<string>;
  roleTags: Set<string>;
  championResource: string;
  hasAdCarryPattern: boolean;
  hasAdCarryCorePattern: boolean;
  hasApPattern: boolean;
  hasApCorePattern: boolean;
  hasSupportPattern: boolean;
  hasSupportCorePattern: boolean;
  hasDefensivePattern: boolean;
  isJungleBuild: boolean;
}

const BUILD_LOW_SIGNAL_TAGS = new Set(["Active", "Aura", "Lane", "Slow", "Stealth", "Vision", "NonbootsMovement"]);
const BUILD_PRIMARY_TAGS = new Set([
  "AbilityHaste",
  "Armor",
  "ArmorPenetration",
  "AttackSpeed",
  "CooldownReduction",
  "CriticalStrike",
  "Damage",
  "GoldPer",
  "Health",
  "LifeSteal",
  "MagicPenetration",
  "MagicResist",
  "Mana",
  "ManaRegen",
  "OnHit",
  "SpellBlock",
  "SpellDamage",
  "SpellVamp",
  "Tenacity"
]);
const AD_CARRY_TAGS = new Set(["AttackSpeed", "CriticalStrike", "OnHit", "LifeSteal"]);
const AD_CARRY_CORE_TAGS = new Set(["AttackSpeed", "CriticalStrike", "OnHit", "LifeSteal"]);
const AP_TAGS = new Set(["Mana", "MagicPenetration", "SpellDamage", "SpellVamp"]);
const AP_CORE_TAGS = new Set(["MagicPenetration", "SpellDamage", "SpellVamp"]);
const SUPPORT_TAGS = new Set(["GoldPer", "ManaRegen", "HealAndShieldPower"]);
const DEFENSIVE_TAGS = new Set(["Armor", "Health", "MagicResist", "SpellBlock", "Tenacity"]);
const DEFENSIVE_IDENTITY_TAGS = new Set(["Armor", "MagicResist", "SpellBlock", "Tenacity"]);

function getChampionSpecificBuildProfile(round: ItemBuildChallenge, answerItems: GameItem[]): ChampionSpecificBuildProfile {
  const answerTagCounts = new Map<string, number>();

  for (const item of answerItems) {
    for (const tag of item.tags) {
      answerTagCounts.set(tag, (answerTagCounts.get(tag) ?? 0) + 1);
    }
  }

  const answerTags = new Set(answerTagCounts.keys());
  const answerSignalTags = new Set([...answerTags].filter((tag) => !BUILD_LOW_SIGNAL_TAGS.has(tag)));
  const primaryTags = new Set(
    [...answerTagCounts.entries()]
      .filter(
        ([tag, count]) =>
          BUILD_PRIMARY_TAGS.has(tag) &&
          !BUILD_LOW_SIGNAL_TAGS.has(tag) &&
          (count >= 2 || !["Damage", "Health", "AbilityHaste", "CooldownReduction"].includes(tag))
      )
      .map(([tag]) => tag)
  );

  if (primaryTags.size === 0) {
    for (const tag of answerTags) {
      if (BUILD_PRIMARY_TAGS.has(tag)) {
        primaryTags.add(tag);
      }
    }
  }

  const roleTags = getBuildRoleItemTags(round);
  const roleText = normalize([...round.champion.roles, round.targetRole ?? ""].join(" "));
  const isJungleBuild = roleText.includes("jungle") || answerTags.has("Jungle");

  return {
    answerTagCounts,
    answerTags,
    answerSignalTags,
    championResource: normalize(round.champion.resource),
    hasAdCarryPattern: hasAny(answerTags, AD_CARRY_TAGS) || roleText.includes("marksman") || roleText.includes("bottom") || roleText.includes("bot"),
    hasAdCarryCorePattern: hasAny(answerSignalTags, AD_CARRY_CORE_TAGS) && (roleText.includes("marksman") || roleText.includes("bottom") || roleText.includes("bot") || hasAny(answerTags, AD_CARRY_TAGS)),
    hasApCorePattern: hasAny(answerSignalTags, AP_CORE_TAGS),
    hasApPattern: hasAny(answerTags, AP_TAGS) || roleText.includes("mage"),
    hasDefensivePattern: hasAny(answerTags, DEFENSIVE_IDENTITY_TAGS) || countOverlap(answerSignalTags, DEFENSIVE_TAGS) >= 2,
    hasSupportPattern: hasAny(answerTags, SUPPORT_TAGS) || roleText.includes("support") || roleText.includes("utility"),
    hasSupportCorePattern: hasAny(answerSignalTags, SUPPORT_TAGS),
    isJungleBuild,
    primaryTags,
    roleTags
  };
}

function buildItemRelevanceScore(item: GameItem, profile: ChampionSpecificBuildProfile, minAnswerGold: number, maxAnswerGold: number) {
  if (!isChampionItemArchetypeCompatible(item, profile)) {
    return 0;
  }

  let score = 0;
  let primaryOverlap = 0;
  let weightedAnswerOverlap = 0;

  for (const tag of item.tags) {
    if (profile.primaryTags.has(tag)) {
      primaryOverlap += 1;
      score += 7 * (profile.answerTagCounts.get(tag) ?? 1);
    }

    if (profile.answerSignalTags.has(tag)) {
      const tagWeight = profile.answerTagCounts.get(tag) ?? 1;
      weightedAnswerOverlap += tagWeight;
      score += 3 * tagWeight;
    }

    if (profile.roleTags.has(tag) && profile.answerSignalTags.has(tag)) {
      score += 1;
    }
  }

  if (primaryOverlap === 0 && weightedAnswerOverlap < 2) {
    return 0;
  }

  if (item.goldTotal >= minAnswerGold - 600 && item.goldTotal <= maxAnswerGold + 600) {
    score += 2;
  }

  if (item.goldTotal >= 2400) {
    score += 1;
  }

  return score;
}

function buildItemSimilarityScore(item: GameItem, profile: ChampionSpecificBuildProfile, minAnswerGold: number, maxAnswerGold: number) {
  const tags = new Set(item.tags);
  let score = 0;

  for (const tag of item.tags) {
    if (profile.primaryTags.has(tag)) {
      score += 5 * (profile.answerTagCounts.get(tag) ?? 1);
    } else if (profile.answerSignalTags.has(tag)) {
      score += 2 * (profile.answerTagCounts.get(tag) ?? 1);
    }

    if (profile.roleTags.has(tag)) {
      score += 1;
    }
  }

  if (profile.hasAdCarryCorePattern && isMarksmanBuildChoice(tags)) {
    score += 6;
  }

  if (profile.hasApCorePattern && hasAny(tags, AP_TAGS)) {
    score += 6;
  }

  if (profile.hasSupportCorePattern && hasAny(tags, SUPPORT_TAGS)) {
    score += 6;
  }

  if (profile.hasDefensivePattern && hasAny(tags, DEFENSIVE_TAGS)) {
    score += 3;
  }

  if (tags.has("Jungle") && !profile.isJungleBuild) {
    score -= 20;
  }

  if (item.goldTotal >= minAnswerGold - 700 && item.goldTotal <= maxAnswerGold + 700) {
    score += 2;
  }

  return score;
}

function fillBuildItemPool(answerItems: GameItem[], candidateGroups: GameItem[][], preferredIds: Set<string>) {
  const targetCount = Math.max(BUILD_RELEVANT_ITEM_LIMIT, answerItems.length);
  const selected: GameItem[] = [];
  const selectedNames = new Set<string>();

  for (const item of answerItems) {
    const key = itemNameKeyForUi(item);
    if (!selectedNames.has(key)) {
      selected.push(item);
      selectedNames.add(key);
    }
  }

  for (const candidates of candidateGroups) {
    for (const item of candidates) {
      if (selected.length >= targetCount) {
        break;
      }

      const key = itemNameKeyForUi(item);
      if (!selectedNames.has(key)) {
        selected.push(item);
        selectedNames.add(key);
      }
    }
  }

  return uniqueItemsByName(selected.slice(0, targetCount), preferredIds);
}

function isChampionItemArchetypeCompatible(item: GameItem, profile: ChampionSpecificBuildProfile) {
  const tags = new Set(item.tags);

  if (tags.has("Jungle") && !profile.isJungleBuild) {
    return false;
  }

  if (hasAny(tags, SUPPORT_TAGS) && !profile.hasSupportPattern) {
    return false;
  }

  if (profile.hasSupportCorePattern && !hasAny(tags, SUPPORT_TAGS) && countOverlap(tags, profile.primaryTags) === 0) {
    return false;
  }

  if (hasAny(tags, AP_TAGS) && !profile.hasApPattern) {
    return false;
  }

  if (
    profile.hasApCorePattern &&
    !hasAny(tags, AP_TAGS) &&
    !(profile.hasDefensivePattern && hasAny(tags, DEFENSIVE_IDENTITY_TAGS) && countOverlap(tags, profile.primaryTags) > 0)
  ) {
    return false;
  }

  if (tags.has("Mana") && profile.championResource && !profile.championResource.includes("mana") && !profile.answerTags.has("Mana")) {
    return false;
  }

  if (hasAny(tags, AD_CARRY_TAGS) && !profile.hasAdCarryPattern && countOverlap(tags, profile.primaryTags) === 0) {
    return false;
  }

  if (
    profile.hasAdCarryCorePattern &&
    !isMarksmanBuildChoice(tags)
  ) {
    return false;
  }

  if (hasAny(tags, DEFENSIVE_TAGS) && !profile.hasDefensivePattern && countOverlap(tags, profile.primaryTags) === 0) {
    return false;
  }

  return true;
}

function isMarksmanBuildChoice(tags: Set<string>) {
  if (tags.has("CriticalStrike")) {
    return true;
  }

  if (tags.has("Damage") && hasAny(tags, DEFENSIVE_IDENTITY_TAGS) && !tags.has("Health") && !tags.has("CooldownReduction") && !tags.has("AbilityHaste")) {
    return true;
  }

  if ((tags.has("AttackSpeed") || tags.has("OnHit") || tags.has("LifeSteal")) && !tags.has("Health") && !tags.has("CooldownReduction") && !tags.has("AbilityHaste")) {
    return true;
  }

  return false;
}

function hasAny(values: Set<string>, candidates: Set<string>) {
  for (const value of candidates) {
    if (values.has(value)) {
      return true;
    }
  }

  return false;
}

function countOverlap(left: Set<string>, right: Set<string>) {
  let count = 0;

  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }

  return count;
}

function answerGoldRange(answerItems: GameItem[]) {
  const totals = answerItems.map((item) => item.goldTotal);
  return [Math.min(...totals), Math.max(...totals)] as const;
}

function getBuildRoleItemTags(round: ItemBuildChallenge) {
  const roleTags = new Set<string>();
  const sourceRoles = [...round.champion.roles, round.targetRole ?? ""].map((role) => normalize(role));
  const add = (...tags: string[]) => tags.forEach((tag) => roleTags.add(tag));

  for (const role of sourceRoles) {
    if (role.includes("marksman") || role.includes("bottom") || role.includes("bot")) {
      add("Damage", "CriticalStrike", "AttackSpeed", "ArmorPenetration", "LifeSteal", "OnHit");
    }

    if (role.includes("mage") || role.includes("mid")) {
      add("SpellDamage", "Mana", "MagicPenetration", "CooldownReduction");
    }

    if (role.includes("assassin")) {
      add("Damage", "ArmorPenetration", "CooldownReduction", "NonbootsMovement");
    }

    if (role.includes("fighter") || role.includes("jungle")) {
      add("Damage", "Health", "ArmorPenetration", "AttackSpeed", "LifeSteal", "CooldownReduction");
    }

    if (role.includes("tank") || role.includes("top")) {
      add("Health", "Armor", "SpellBlock", "CooldownReduction", "NonbootsMovement");
    }

    if (role.includes("support") || role.includes("utility")) {
      add("Health", "ManaRegen", "GoldPer", "HealAndShieldPower", "CooldownReduction", "Armor", "SpellBlock");
    }
  }

  return roleTags;
}

function isBuildCandidateChoice(item: GameItem) {
  return (
    item.purchasable &&
    item.goldTotal >= 1600 &&
    item.into.length === 0 &&
    item.tags.length > 0 &&
    !item.tags.includes("Boots") &&
    !item.tags.includes("Consumable") &&
    !item.tags.includes("Trinket")
  );
}

function isUpgradedBootsChoice(item: GameItem) {
  return (
    item.purchasable &&
    item.name !== "Boots" &&
    item.goldTotal >= 900 &&
    (item.tags.includes("Boots") || item.from.some((id) => TIER_TWO_BOOT_IDS.has(id))) &&
    !item.tags.includes("Consumable") &&
    !item.tags.includes("Trinket")
  );
}

function uniqueItemsByName(items: GameItem[], preferredIds = new Set<string>()) {
  const byName = new Map<string, GameItem>();

  for (const item of items) {
    const key = itemNameKeyForUi(item);
    const existing = byName.get(key);

    if (!existing || (preferredIds.has(item.id) && !preferredIds.has(existing.id))) {
      byName.set(key, item);
    }
  }

  return [...byName.values()];
}

function itemNameKeyForUi(item: GameItem) {
  return item.name.trim().toLowerCase();
}

export function ItemRecipeGame({
  challenge,
  items: itemCatalog = [],
  username = "Guest",
  pageRail = false
}: {
  challenge: ItemRecipeChallenge;
  items?: GameItem[];
  username?: string;
  pageRail?: boolean;
}) {
  const generatedRounds = useMemo(() => createRecipeRounds(challenge, itemCatalog), [challenge, itemCatalog]);
  const rounds = useRandomizedRounds(generatedRounds, "item-recipe", username);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("item-recipe", username);
  const round = rounds[roundIndex % rounds.length];
  const correct = submitted && answer === round.missingComponentId;
  const selected = round.allComponents.find((item) => item.id === answer);
  const componentChoices = useMemo(() => uniqueItemsByName(round.allComponents, new Set([round.missingComponentId])), [round.allComponents, round.missingComponentId]);
  const orderedComponents = useMemo(() => sortRecipeComponents(componentChoices), [componentChoices]);

  function submitRecipe() {
    if (!answer || submitted) {
      return;
    }

    const solved = answer === round.missingComponentId;
    setSubmitted(true);
    recordStreak(solved, {
      performanceQuality: solved ? 0.8 : 0.2,
      roundId: round.id,
      metadata: {
        resultItem: round.resultItem.name,
        selectedItem: selected?.name ?? answer
      }
    });
  }

  function nextRecipe() {
    setRoundIndex((current) => current + 1);
    setAnswer("");
    setSubmitted(false);
  }

  const leftRail = (
    <aside
      className={cn(
        "min-w-0",
        pageRail
          ? "xl:sticky xl:top-2 xl:col-start-1 xl:row-start-1 xl:row-span-2 xl:h-[calc(100dvh-1rem)] xl:self-start xl:overflow-hidden"
          : "xl:sticky xl:top-3 xl:max-h-[calc(100dvh-1.5rem)] xl:self-start xl:overflow-y-auto xl:pr-1 fine-scrollbar"
      )}
    >
      <div
        className={cn(
          "grid w-full gap-2 rounded-xl border border-[#3c3421] bg-[radial-gradient(circle_at_18%_0%,rgba(200,155,60,.12),transparent_30%),linear-gradient(180deg,rgba(11,17,27,.97),rgba(5,7,11,.96))] p-2.5 shadow-[0_24px_70px_rgba(0,0,0,.34),inset_0_1px_0_rgba(255,255,255,.055)] sm:gap-3 sm:p-4 xl:rounded-lg",
          pageRail && "xl:h-full xl:content-start xl:overflow-y-auto xl:overflow-x-hidden xl:pr-2 rail-scrollbar"
        )}
      >
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <span className="text-[#c89b3c]">
            <Split size={18} />
          </span>
          <h2 className="text-lg font-semibold sm:text-xl">Guess the Recipe</h2>
        </div>
        <div className="hidden sm:block">
          <InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />
        </div>
        <div className="grid justify-items-center gap-2 rounded-sm border border-white/10 bg-[#050607]/75 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] sm:p-3">
          <ItemShopNode item={round.resultItem} size="large" />
        </div>
        <div className="grid gap-2 rounded-sm border border-[#3c3421] bg-[#111722] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] sm:gap-3 sm:p-3">
          <div className="mx-auto h-5 w-px bg-[#3c3421] sm:h-8" />
          <div className="grid grid-cols-4 items-start gap-2 sm:grid-cols-3 sm:gap-3">
            {round.knownComponents.map((item) => (
              <ItemShopNode key={item.id} item={item} />
            ))}
            <MissingRecipeNode item={selected} submitted={submitted} correct={correct} />
          </div>
        </div>
        <div className="grid gap-2">
          {submitted && (
            <div className="text-sm text-[color:var(--muted)]">
              {correct ? "Correct component." : `Correct answer: ${getItemName(round.allComponents, round.missingComponentId)}`}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={!answer || submitted} onClick={() => { setAnswer(""); setSubmitted(false); }}>
              Clear
            </Button>
            <Button type="button" onClick={submitRecipe} disabled={!answer || submitted}>
              Lock
            </Button>
            {submitted && (
              <Button type="button" variant="secondary" onClick={nextRecipe}>
                Next
              </Button>
            )}
            <ResultPill submitted={submitted} correct={correct} answer={getItemName(round.allComponents, round.missingComponentId)} />
          </div>
        </div>
      </div>
    </aside>
  );

  const gameContent = (
    <div className="play-area-content grid gap-3 pb-10">
      <div className="play-inset-panel-depth rounded-sm border border-[#3c3421] p-2 sm:p-4">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-display text-base font-extrabold text-white sm:text-xl">Find the missing component.</div>
          </div>
          <div className="text-xs text-[color:var(--muted)]">{componentChoices.length}</div>
        </div>
        <div className="grid grid-cols-3 content-start gap-1.5 px-0.5 pb-4 pt-1.5 sm:grid-cols-3 sm:gap-2 sm:px-1 sm:pb-5 sm:pt-2 md:grid-cols-4 2xl:grid-cols-6">
          {orderedComponents.map((item) => {
            const result: ItemGuessResult | undefined = submitted
              ? item.id === round.missingComponentId
                ? "correct"
                : item.id === answer
                  ? "wrong"
                  : undefined
              : undefined;

            return (
              <button
                key={item.id}
                type="button"
                disabled={submitted}
                onClick={() => {
                  if (!submitted) {
                    setAnswer(item.id);
                  }
                }}
                className={cn(
                  "play-choice-depth relative grid min-h-20 content-center justify-items-center gap-1 overflow-hidden rounded-sm border p-1.5 text-center transition duration-150 hover:z-10 hover:scale-[1.025] hover:border-[#c89b3c] disabled:cursor-not-allowed sm:min-h-28 sm:gap-2 sm:p-2",
                  result === "correct" && "play-choice-depth-correct border-green-400/70 shadow-[inset_0_0_0_1px_rgba(74,222,128,.22)]",
                  result === "wrong" && "play-choice-depth-wrong border-[#394150] grayscale",
                  !result && (answer === item.id ? "play-choice-depth-selected border-[#c89b3c] ring-2 ring-[#c89b3c]/35" : "play-choice-depth-default border-[#26313f]"),
                  submitted && !result && "opacity-55"
                )}
                title={`${item.name} - ${item.goldTotal}g`}
              >
                {result === "correct" && (
                  <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-green-400 text-[#071018]">
                    <CheckCircle2 size={13} />
                  </span>
                )}
                {result === "wrong" && (
                  <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[#5b6472] bg-[#111722] text-[#9ca3af]">
                    <XCircle size={13} />
                  </span>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl} alt="" className="h-10 w-10 object-contain sm:h-14 sm:w-14" />
                <span className="line-clamp-2 text-center text-[10px] font-semibold leading-tight sm:text-xs">{item.name}</span>
                <span className={cn("text-[10px] sm:text-[11px]", result === "wrong" ? "text-[#9ca3af]" : "text-[#c89b3c]")}>{item.goldTotal}g</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (pageRail) {
    return (
      <>
        {leftRail}
        <section className="play-area-depth min-h-[calc(100dvh-5rem)] rounded-lg border border-[#3c3421] p-2 pb-16 sm:p-4 lg:rounded-sm xl:col-start-2 xl:row-start-2 xl:min-h-[calc(100dvh-5.25rem)]">
          {gameContent}
        </section>
      </>
    );
  }

  return (
    <section className="play-area-depth min-h-[calc(100dvh-5rem)] rounded-lg border border-[#3c3421] p-2 pb-16 sm:p-4 lg:rounded-sm">
      <div className="grid items-start gap-2 sm:gap-4 xl:grid-cols-[minmax(18rem,30%)_minmax(0,1fr)]">
        {leftRail}
        {gameContent}
      </div>
    </section>
  );
}

function BuildSlot({
  item,
  submitted,
  correct,
  label,
  onRemove
}: {
  item?: GameItem;
  submitted: boolean;
  correct: boolean;
  label: string;
  onRemove?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      disabled={!onRemove}
      className={cn(
        "group relative grid min-h-9 place-items-center rounded-sm border bg-[#111722] p-0.5 text-center transition disabled:cursor-default sm:min-h-16 sm:p-1.5",
        item && !submitted && "border-[#c89b3c] bg-[#c89b3c]/10 shadow-[inset_0_0_0_1px_rgba(245,197,66,.18)]",
        !item && "border-dashed border-[#394150]",
        submitted && (correct ? "border-green-400/70 bg-green-500/18" : "border-[#394150] bg-[#151b26] grayscale")
      )}
    >
      {item ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt="" className="h-5 w-5 object-contain sm:h-8 sm:w-8" />
          <span className="line-clamp-2 text-[7px] font-semibold leading-tight sm:text-[9px]">{item.name}</span>
          {!submitted && (
            <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[#c89b3c]/40 bg-[#050607]/90 text-[#f5c542] opacity-0 transition group-hover:opacity-100">
              <X size={12} />
            </span>
          )}
        </>
      ) : (
        <span className="text-[7px] uppercase text-[color:var(--muted)] sm:text-xs">{label}</span>
      )}
    </button>
  );
}

function ItemChoiceCard({
  item,
  selected,
  result,
  disabled,
  onClick
}: {
  item: GameItem;
  selected: boolean;
  result?: ItemGuessResult;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "play-choice-depth relative grid h-full min-h-[6.25rem] content-center justify-items-center gap-1 overflow-hidden rounded-sm border p-1.5 text-center transition duration-150 hover:scale-[1.025] hover:border-[#c89b3c] disabled:cursor-not-allowed sm:min-h-[7.35rem] sm:gap-1.5 sm:p-2 xl:min-h-[8rem]",
        result === "correct" && "play-choice-depth-correct border-green-400/70 shadow-[inset_0_0_0_1px_rgba(74,222,128,.22)]",
        result === "wrong" && "play-choice-depth-wrong border-[#394150] grayscale",
        !result && (selected ? "play-choice-depth-selected border-[#c89b3c] shadow-[inset_0_0_0_1px_rgba(245,197,66,.25)]" : "play-choice-depth-default border-[#26313f]"),
        selected && "ring-2 ring-[#c89b3c]/35",
        disabled && !result && "opacity-35"
      )}
      title={item.name}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#c89b3c] text-[#071018]">
          <CheckCircle2 size={13} />
        </span>
      )}
      {!selected && result === "correct" && (
        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-green-400 text-[#071018]">
          <CheckCircle2 size={13} />
        </span>
      )}
      {!selected && result === "wrong" && (
        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[#5b6472] bg-[#111722] text-[#9ca3af]">
          <XCircle size={13} />
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt="" className="h-11 w-11 object-contain sm:h-14 sm:w-14 xl:h-16 xl:w-16" />
      <span className="line-clamp-2 text-[10px] font-semibold leading-tight sm:text-[13px]">{item.name}</span>
    </button>
  );
}

function BootChoiceCard({
  item,
  selected,
  result,
  disabled,
  onClick
}: {
  item: GameItem;
  selected: boolean;
  result?: ItemGuessResult;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "play-choice-depth relative grid h-full min-h-[5.5rem] grid-cols-[2.5rem_1fr] items-center gap-2 overflow-hidden rounded-sm border p-2 text-left transition duration-150 hover:scale-[1.025] hover:border-[#c89b3c] disabled:cursor-not-allowed sm:min-h-[6.25rem] sm:grid-cols-[3rem_1fr] sm:gap-2.5 sm:p-2.5 xl:min-h-[6.6rem]",
        result === "correct" && "play-choice-depth-correct border-green-400/70 shadow-[inset_0_0_0_1px_rgba(74,222,128,.22)]",
        result === "wrong" && "play-choice-depth-wrong border-[#394150] grayscale",
        !result && (selected ? "play-choice-depth-selected border-[#c89b3c] shadow-[inset_0_0_0_1px_rgba(245,197,66,.25)]" : "play-choice-depth-default border-[#26313f]"),
        selected && "ring-2 ring-[#c89b3c]/35",
        disabled && !result && "opacity-35"
      )}
      title={item.name}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#c89b3c] text-[#071018]">
          <CheckCircle2 size={11} />
        </span>
      )}
      {!selected && result === "correct" && (
        <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-green-400 text-[#071018]">
          <CheckCircle2 size={11} />
        </span>
      )}
      {!selected && result === "wrong" && (
        <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full border border-[#5b6472] bg-[#111722] text-[#9ca3af]">
          <XCircle size={11} />
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt="" className="h-10 w-10 object-contain sm:h-12 sm:w-12" />
      <span className="min-w-0 whitespace-normal break-words text-xs font-semibold leading-tight sm:text-sm">{item.name}</span>
    </button>
  );
}

function ItemShopNode({ item, size = "normal" }: { item: GameItem; size?: "normal" | "large" }) {
  return (
    <div className={cn("grid justify-items-center gap-1 rounded-sm border border-[#3c3421] bg-[#111722] p-1.5 text-center sm:p-2", size === "large" && "min-w-28 p-2 sm:min-w-36 sm:p-3")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt="" className={cn("object-contain", size === "large" ? "h-12 w-12 sm:h-16 sm:w-16" : "h-9 w-9 sm:h-12 sm:w-12")} />
      <span className="line-clamp-2 text-[10px] font-semibold leading-tight sm:text-xs">{item.name}</span>
      <span className="text-[9px] text-[#c89b3c] sm:text-[10px]">{item.goldTotal}g</span>
    </div>
  );
}

function MissingRecipeNode({ item, submitted, correct }: { item?: GameItem; submitted: boolean; correct: boolean }) {
  return (
    <div
      className={cn(
        "grid min-h-28 justify-items-center gap-1 rounded-sm border border-dashed bg-[#111722] p-2 text-center",
        submitted ? (correct ? "border-green-400/70 bg-green-500/18" : "border-red-400/60 bg-red-500/12") : "border-[#c89b3c]"
      )}
    >
      {item ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt="" className="h-12 w-12 object-contain" />
          <span className="line-clamp-2 text-xs font-semibold leading-tight">{item.name}</span>
          <span className="text-[10px] text-[#c89b3c]">{item.goldTotal}g</span>
        </>
      ) : (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-sm border border-[#3c3421] text-xl text-[#c89b3c]">?</span>
          <span className="text-xs uppercase text-[color:var(--muted)]">Missing</span>
        </>
      )}
    </div>
  );
}

function InfiniteStreakBar({ round, current, best }: { round: number; current: number; best: number }) {
  return (
    <div className="flex flex-wrap gap-2.5 text-sm text-[color:var(--muted)]">
      <span className="inline-flex min-h-9 items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 leading-none">
        Round <b className="relative top-px font-display leading-none text-[#f5c542]">{round}</b>
      </span>
      <span className="inline-flex min-h-9 items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 leading-none">
        Streak <b className="relative top-px font-display leading-none text-white">{current}</b>
      </span>
      <span className="inline-flex min-h-9 items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 leading-none">
        Best <b className="relative top-px font-display leading-none text-white">{best}</b>
      </span>
    </div>
  );
}

function useRequestMoreRoundsOnExhaustion(roundsLength: number, onNeedMoreRounds?: () => void) {
  const requestedRef = useRef(false);

  useEffect(() => {
    requestedRef.current = false;
  }, [roundsLength]);

  return (nextRoundIndex: number) => {
    if (!onNeedMoreRounds || requestedRef.current || roundsLength <= 0 || nextRoundIndex < roundsLength) {
      return;
    }

    requestedRef.current = true;
    onNeedMoreRounds();
  };
}

function useRandomizedRounds<T extends { id: string }>(
  rounds: T[],
  gameKey: string,
  username: string,
  avoidTripleKey?: (round: T) => string | undefined,
  priorityForRound?: (round: T) => number,
  avoidFirstKey?: (round: T) => string | undefined
) {
  const [loadSeed] = useState(() => {
    const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    return `${Date.now()}:${performance.now()}:${username}:${randomId}:${Math.random()}`;
  });
  const storageKey = `rift-daily:last-first-round:${gameKey}:${normalize(username || "guest")}`;
  const firstKeyStorageKey = `rift-daily:last-first-round-key:${gameKey}:${normalize(username || "guest")}`;
  const orderedRounds = useMemo(() => {
    if (rounds.length <= 1) {
      return rounds;
    }

    const randomized = [...rounds].sort((a, b) => {
      const aHash = hashString(`${loadSeed}:${a.id}`);
      const bHash = hashString(`${loadSeed}:${b.id}`);

      return aHash - bHash || a.id.localeCompare(b.id);
    });

    if (priorityForRound) {
      randomized.sort((a, b) => {
        const aScore = weightedRoundScore(a, priorityForRound, loadSeed);
        const bScore = weightedRoundScore(b, priorityForRound, loadSeed);

        return bScore - aScore || a.id.localeCompare(b.id);
      });
    }

    const lastFirstRoundId = typeof window === "undefined" ? "" : window.localStorage.getItem(storageKey);
    const lastFirstRoundKey = typeof window === "undefined" ? "" : window.localStorage.getItem(firstKeyStorageKey);

    if (avoidTripleKey) {
      return orderRoundsAvoidingTripleKey(randomized, avoidTripleKey, lastFirstRoundId ?? "");
    }

    const firstRoundRepeatsId = lastFirstRoundId && randomized[0]?.id === lastFirstRoundId;
    const firstRoundRepeatsKey = lastFirstRoundKey && avoidFirstKey && avoidFirstKey(randomized[0]) === lastFirstRoundKey;

    if (firstRoundRepeatsId || firstRoundRepeatsKey) {
      const currentPriority = priorityForRound ? priorityForRound(randomized[0]) : 0;
      const samePrioritySwapIndex = randomized.findIndex(
        (round) =>
          round.id !== lastFirstRoundId &&
          (!avoidFirstKey || avoidFirstKey(round) !== lastFirstRoundKey) &&
          (!priorityForRound || priorityForRound(round) === currentPriority)
      );
      const swapIndex =
        samePrioritySwapIndex > 0
          ? samePrioritySwapIndex
          : randomized.findIndex((round) => round.id !== lastFirstRoundId && (!avoidFirstKey || avoidFirstKey(round) !== lastFirstRoundKey));

      if (swapIndex > 0) {
        [randomized[0], randomized[swapIndex]] = [randomized[swapIndex], randomized[0]];
      }
    }

    return randomized;
  }, [avoidFirstKey, avoidTripleKey, firstKeyStorageKey, loadSeed, priorityForRound, rounds, storageKey]);

  useEffect(() => {
    const firstRound = orderedRounds[0];

    if (firstRound) {
      window.localStorage.setItem(storageKey, firstRound.id);
      const firstKey = avoidFirstKey?.(firstRound);

      if (firstKey) {
        window.localStorage.setItem(firstKeyStorageKey, firstKey);
      }
    }
  }, [avoidFirstKey, firstKeyStorageKey, orderedRounds, storageKey]);

  return orderedRounds;
}

function weightedRoundScore<T extends { id: string }>(round: T, priorityForRound: (round: T) => number, seed: string) {
  const randomScore = hashString(`${seed}:weighted-round:${round.id}`) % 1000;
  const priorityScore = Math.max(0, priorityForRound(round)) * 120;

  return randomScore + priorityScore;
}

function orderRoundsAvoidingTripleKey<T extends { id: string }>(rounds: T[], keyForRound: (round: T) => string | undefined, blockedFirstRoundId: string) {
  const remaining = [...rounds];
  const ordered: T[] = [];

  while (remaining.length > 0) {
    const previous = ordered[ordered.length - 1];
    const beforePrevious = ordered[ordered.length - 2];
    const repeatedKey = previous && beforePrevious && keyForRound(previous) === keyForRound(beforePrevious) ? keyForRound(previous) : "";
    const hasAlternativeFirst = ordered.length === 0 && remaining.some((round) => round.id !== blockedFirstRoundId);
    const hasAlternativeKey = Boolean(repeatedKey) && remaining.some((round) => keyForRound(round) !== repeatedKey);
    const best = remaining
      .map((round, index) => ({
        index,
        firstRepeatPenalty: hasAlternativeFirst && round.id === blockedFirstRoundId ? 1 : 0,
        tripleRepeatPenalty: hasAlternativeKey && keyForRound(round) === repeatedKey ? 1 : 0
      }))
      .sort((a, b) => a.firstRepeatPenalty - b.firstRepeatPenalty || a.tripleRepeatPenalty - b.tripleRepeatPenalty || a.index - b.index)[0];
    const [next] = remaining.splice(best?.index ?? 0, 1);

    if (next) {
      ordered.push(next);
    }
  }

  return ordered;
}

interface RankedRecordOptions {
  performanceQuality?: number;
  roundId?: string;
  metadata?: Record<string, unknown>;
}

function usePersonalModeStreak(gameKey: string, username: string) {
  const storageKey = `rift-daily:${gameKey}:${normalize(username || "guest")}`;
  const [streak, setStreak] = useState({ current: 0, best: 0, played: 0, wins: 0 });
  const streakRef = useRef(streak);

  useEffect(() => {
    streakRef.current = streak;
  }, [streak]);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { current: number; best: number; played: number; wins?: number };
        const next = { ...parsed, wins: parsed.wins ?? 0 };
        streakRef.current = next;
        setStreak(next);
      } catch {
        const fallback = { current: 0, best: 0, played: 0, wins: 0 };
        streakRef.current = fallback;
        setStreak(fallback);
      }
    } else {
      const fallback = { current: 0, best: 0, played: 0, wins: 0 };
      streakRef.current = fallback;
      setStreak(fallback);
    }
  }, [storageKey]);

  function record(correct: boolean, options: RankedRecordOptions = {}) {
    const performanceQuality = Math.max(0, Math.min(1, options.performanceQuality ?? (correct ? 0.75 : 0.25)));
    const roundId = options.roundId ?? `${gameKey}:${Date.now()}`;
    const lpDelta = calculateLpDelta({ won: correct });
    const current = streakRef.current;
    const nextCurrent = correct ? current.current + 1 : 0;
    const next = {
      current: nextCurrent,
      best: Math.max(current.best, nextCurrent),
      played: current.played + 1,
      wins: current.wins + (correct ? 1 : 0)
    };

    streakRef.current = next;
    setStreak(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    updateLocalRankState(username, correct, performanceQuality, lpDelta);
    window.dispatchEvent(new Event("rift-daily:streak-updated"));

    void persistRankedResult(gameKey, username, correct, performanceQuality, lpDelta, roundId, options.metadata);
  }

  return [streak, record] as const;
}

function updateLocalRankState(username: string, won: boolean, performanceQuality: number, lpDelta: number) {
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

async function persistRankedResult(
  gameKey: string,
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
      headers: {
        "Content-Type": "application/json"
      },
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

      window.dispatchEvent(new Event("rift-daily:streak-updated"));
    }
  } catch {
    // Network failures should not block the game loop; signed-in stats sync on the next successful submission.
  }
}

function createRecipeRounds(base: ItemRecipeChallenge, itemCatalog: GameItem[]) {
  const craftable = itemCatalog.filter((item) =>
    item.from.length >= 2 &&
    item.from.every((id) => {
      const component = findItem(itemCatalog, id);
      return component && isRecipeComponentChoice(component, itemCatalog);
    })
  );

  if (craftable.length === 0) {
    return [{ ...base, allComponents: getRecipeComponentChoices(itemCatalog, [base.missingComponentId]) }];
  }

  return [
    base,
    ...Array.from({ length: INFINITE_ROUNDS }, (_, index) => createGeneratedRecipeRound(base, itemCatalog, craftable, index + 1))
  ];
}

function createGeneratedRecipeRound(base: ItemRecipeChallenge, itemCatalog: GameItem[], craftable: GameItem[], round: number): ItemRecipeChallenge {
  const seed = `${base.date}:recipe-infinite:${round}`;
  const resultItem = craftable[hashString(`${seed}:result`) % craftable.length];
  const componentIds = resultItem.from;
  const missingComponentId = componentIds[hashString(`${seed}:missing`) % componentIds.length];
  const knownComponents = componentIds.filter((id) => id !== missingComponentId).map((id) => findItem(itemCatalog, id)).filter(Boolean) as GameItem[];
  const missing = findItem(itemCatalog, missingComponentId) ?? knownComponents[0] ?? base.resultItem;
  const allComponents = getRecipeComponentChoices(itemCatalog, [missing.id]);
  const distractors = allComponents
    .filter((item) => item.id !== missing.id && item.goldTotal <= Math.max(missing.goldTotal + 500, 900))
    .sort((a, b) => (hashString(`${seed}:${a.id}`) % 1000) - (hashString(`${seed}:${b.id}`) % 1000))
    .slice(0, 5);

  return {
    ...base,
    id: `${base.date}:item-recipe:${round}`,
    resultItem,
    knownComponents,
    missingComponentId: missing.id,
    options: [missing, ...distractors].sort((a, b) => a.name.localeCompare(b.name)),
    allComponents
  };
}

function sortRecipeComponents(items: GameItem[]) {
  return [...items].sort((a, b) => a.goldTotal - b.goldTotal || a.name.localeCompare(b.name));
}

function findItem(itemCatalog: GameItem[], id: string) {
  return itemCatalog.find((item) => item.id === id);
}

function getRecipeComponentChoices(itemCatalog: GameItem[], includeIds: string[] = []) {
  const include = new Set(includeIds);
  const candidates = itemCatalog
    .filter((item) => isRecipeComponentChoice(item, itemCatalog) || include.has(item.id))
    .sort((a, b) => a.goldTotal - b.goldTotal || a.name.localeCompare(b.name));
  const chosen: GameItem[] = [];

  for (const item of candidates) {
    const existingIndex = chosen.findIndex((candidate) => candidate.name.toLowerCase() === item.name.toLowerCase());

    if (existingIndex === -1) {
      chosen.push(item);
    } else if (include.has(item.id) && !include.has(chosen[existingIndex].id)) {
      chosen[existingIndex] = item;
    }
  }

  return chosen;
}

function isRecipeComponentChoice(item: GameItem, itemCatalog: GameItem[]) {
  const usedByPurchasableItem = itemCatalog.some((parent) => parent.purchasable && parent.from.includes(item.id));

  return (
    usedByPurchasableItem &&
    item.purchasable &&
    item.goldTotal > 0 &&
    item.goldTotal <= 1800 &&
    !item.tags.includes("Consumable") &&
    !item.tags.includes("Trinket") &&
    (item.name === "Boots" || !item.tags.includes("Boots"))
  );
}

type EloRound = GuessEloRound;
type MatchupSide = "left" | "right";

export function ChampionMatchupGame({
  challenge,
  username = "Guest",
  onNeedMoreRounds
}: {
  challenge: ChampionMatchupChallenge;
  username?: string;
  onNeedMoreRounds?: () => void;
}) {
  const generatedRounds = useMemo(() => createChampionMatchupRounds(challenge), [challenge]);
  const rounds = useRandomizedRounds(generatedRounds, "champion-matchup", username);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState<MatchupSide | "">("");
  const [submitted, setSubmitted] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("champion-matchup", username);
  const requestMoreRoundsIfExhausted = useRequestMoreRoundsOnExhaustion(rounds.length, onNeedMoreRounds);
  const round = rounds[roundIndex % rounds.length];
  const correct = submitted && answer === round.answerSide;

  function choose(side: MatchupSide) {
    if (submitted) {
      return;
    }

    setAnswer(side);
    setSubmitted(true);
    recordStreak(side === round.answerSide, {
      performanceQuality: side === round.answerSide ? 0.8 : 0.2,
      roundId: round.id,
      metadata: {
        selectedSide: side,
        answerSide: round.answerSide,
        leftChampion: round.left.champion.name,
        leftRole: round.left.role,
        rightChampion: round.right.champion.name,
        rightRole: round.right.role,
        sampleSize: round.left.games
      }
    });
  }

  function nextRound() {
    setRoundIndex((current) => {
      const nextIndex = current + 1;
      requestMoreRoundsIfExhausted(nextIndex);
      return nextIndex;
    });
    setAnswer("");
    setSubmitted(false);
  }

  return (
    <PuzzleFrame
      icon={<Swords size={18} />}
      title="Who Wins More?"
      headerAccessory={<InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />}
      playAreaDepth
    >
      {round.unavailableReason ? (
        <VerifiedDataUnavailable reason={round.unavailableReason} />
      ) : (
        <div className="grid flex-1 gap-2 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto_auto] lg:gap-4">
          <div className="play-panel-depth grid gap-2 rounded-sm border border-[#3c3421] p-2 sm:gap-3 sm:p-3 lg:min-h-[28rem] lg:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)]">
            <MatchupChampionCard side="left" pick={round.left} revealed={submitted} selected={answer === "left"} submitted={submitted} correctSide={round.answerSide === "left"} />
            <div className="grid place-items-center">
              <MatchupVsMark />
            </div>
            <MatchupChampionCard side="right" pick={round.right} revealed={submitted} selected={answer === "right"} submitted={submitted} correctSide={round.answerSide === "right"} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => choose("left")}
              disabled={submitted}
              className={cn(
                "font-display min-h-14 rounded-sm border px-4 text-lg font-extrabold transition disabled:cursor-default",
                answer === "left" && correct && "border-green-300 bg-green-500 text-[#071018]",
                answer === "left" && !correct && submitted && "border-red-300 bg-red-500 text-white",
                answer !== "left" && submitted && round.answerSide === "left" && "border-green-400/70 bg-green-500/18 text-green-100",
                !submitted && "border-[#3c3421] bg-[#111722] text-[#f1d58a] hover:border-[#c89b3c] hover:bg-[#c89b3c]/12"
              )}
            >
              {round.left.champion.name} wins more
            </button>
            <button
              type="button"
              onClick={() => choose("right")}
              disabled={submitted}
              className={cn(
                "font-display min-h-14 rounded-sm border px-4 text-lg font-extrabold transition disabled:cursor-default",
                answer === "right" && correct && "border-green-300 bg-green-500 text-[#071018]",
                answer === "right" && !correct && submitted && "border-red-300 bg-red-500 text-white",
                answer !== "right" && submitted && round.answerSide === "right" && "border-green-400/70 bg-green-500/18 text-green-100",
                !submitted && "border-[#3c3421] bg-[#111722] text-[#f1d58a] hover:border-[#c89b3c] hover:bg-[#c89b3c]/12"
              )}
            >
              {round.right.champion.name} wins more
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ResultPill submitted={submitted} correct={correct} answer={round.answerSide === "left" ? round.left.champion.name : round.right.champion.name} />
            {submitted && (
              <Button type="button" onClick={nextRound}>
                Next matchup
              </Button>
            )}
          </div>
          {submitted && (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <MatchupRevealLine pick={round.left} />
              <MatchupRevealLine pick={round.right} />
            </div>
          )}
        </div>
      )}
    </PuzzleFrame>
  );
}

function MatchupChampionCard({
  side,
  pick,
  revealed,
  selected,
  submitted,
  correctSide
}: {
  side: MatchupSide;
  pick: ChampionMatchupRound["left"];
  revealed: boolean;
  selected: boolean;
  submitted: boolean;
  correctSide: boolean;
}) {
  const tone = submitted && correctSide ? "border-green-400/70" : submitted && selected ? "border-red-400/70" : "border-[#3c3421]";

  return (
    <article className={cn("play-card-depth relative min-h-0 overflow-hidden rounded-sm border bg-[#071018]", tone)}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${pick.champion.splashUrl})` }} />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(5,6,7,.98),rgba(5,6,7,.58)_45%,rgba(5,6,7,.18))]" />
      <div className="relative flex h-full min-h-[18rem] flex-col justify-between p-3 sm:min-h-[24rem] sm:p-4 lg:min-h-[28rem] lg:p-5">
        <div className={cn("grid gap-1.5", side === "left" ? "justify-items-end text-right" : "justify-items-start text-left")}>
          <span className="rounded-sm border border-[#c89b3c]/45 bg-[#050607]/82 px-4 py-1.5 font-display text-sm font-bold uppercase leading-none tracking-[0.12em] text-[#f1d58a] sm:text-base">
            {pick.role}
          </span>
          <span className="rounded-sm border border-white/10 bg-[#050607]/70 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.08em] text-[color:var(--muted)]">
            {pick.games} game{pick.games === 1 ? "" : "s"}
          </span>
        </div>
        <div className={cn("grid gap-4", side === "left" && "justify-items-end text-right")}>
          <div>
            <div className="font-display text-3xl font-black leading-none tracking-tight text-white drop-shadow sm:text-5xl">{pick.champion.name}</div>
            <div className="mt-2 text-sm uppercase tracking-[0.12em] text-[#c89b3c]">{pick.champion.title}</div>
          </div>
          <div className={cn("grid max-w-xs gap-2 rounded-sm border border-white/10 bg-[#050607]/78 p-3 backdrop-blur sm:p-4", !revealed && "border-[#c89b3c]/35")}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-[color:var(--muted)]">
              <TrendingUp size={14} />
              Champion-lane sample
            </div>
            {revealed ? (
              <>
                <div className={cn("font-display text-4xl font-black leading-none sm:text-5xl", submitted && correctSide ? "text-green-300" : "text-[#f1d58a]")}>{pick.winRate.toFixed(1)}%</div>
                <div className="text-sm text-[color:var(--muted)]">{pick.wins}W / {pick.games}G in this lane</div>
              </>
            ) : (
              <>
                <div className="font-display text-4xl font-black leading-none text-[#f1d58a] sm:text-5xl">?.?%</div>
                <div className="text-sm text-[color:var(--muted)]">Higher or lower?</div>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function MatchupVsMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-full border border-[#3c3421] bg-[#111722] font-display font-black text-[#c89b3c] shadow-[0_0_28px_rgba(200,155,60,.16)]",
        compact ? "h-12 w-12 text-base md:h-14 md:w-14 md:text-lg xl:h-16 xl:w-16 xl:text-xl" : "h-14 w-14 text-lg lg:h-20 lg:w-20 lg:text-2xl"
      )}
    >
      VS
    </div>
  );
}

function MatchupRevealLine({ pick }: { pick: ChampionMatchupRound["left"] }) {
  return (
    <div className="rounded-sm border border-[#3c3421] bg-[#111722] p-3">
      <div className="text-xs uppercase text-[#c89b3c]">{pick.champion.name} {pick.role}</div>
      <div className="mt-1 text-sm text-[color:var(--muted)]">
        {pick.winRate.toFixed(1)}% sampled winrate, {pick.wins} wins over {pick.games} verified {pick.role} game{pick.games === 1 ? "" : "s"}.
      </div>
    </div>
  );
}

function createChampionMatchupRounds(base: ChampionMatchupChallenge): ChampionMatchupRound[] {
  return base.rounds && base.rounds.length > 0 ? base.rounds : [base];
}

export function GuessEloGame({
  challenge,
  username = "Guest",
  onNeedMoreRounds
}: {
  challenge: GuessEloChallenge;
  username?: string;
  onNeedMoreRounds?: () => void;
}) {
  const generatedRounds = useMemo(() => createEloRounds(challenge), [challenge]);
  const rounds = useRandomizedRounds(generatedRounds, "guess-elo", username, guessEloAnswerKey);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [matchDataExpanded, setMatchDataExpanded] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("guess-elo", username);
  const requestMoreRoundsIfExhausted = useRequestMoreRoundsOnExhaustion(rounds.length, onNeedMoreRounds);
  const round = rounds[roundIndex % rounds.length];
  const correct = submitted && answer === round.answerTier;

  function choose(option: string) {
    if (submitted) {
      return;
    }

    setAnswer(option);
    setSubmitted(true);
    setResultModalOpen(true);

    recordStreak(option === round.answerTier, {
      performanceQuality: option === round.answerTier ? 0.8 : 0.2,
      roundId: round.id,
      metadata: {
        selectedTier: option,
        answerTier: round.answerTier,
        sourceMatchId: round.sourceMatch?.matchId
      }
    });
  }

  function nextRound() {
    setRoundIndex((current) => {
      const nextIndex = current + 1;
      requestMoreRoundsIfExhausted(nextIndex);
      return nextIndex;
    });
    setAnswer("");
    setSubmitted(false);
    setResultModalOpen(false);
    setMatchDataExpanded(false);
  }

  return (
    <PuzzleFrame
      icon={<UsersRound size={18} />}
      title="Guess the ELO"
      headerAccessory={<InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />}
    >
      {round.unavailableReason ? (
        <VerifiedDataUnavailable reason={round.unavailableReason} />
      ) : (
      <div className="grid flex-1 gap-2 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto_auto] lg:gap-4">
        <div className="grid gap-2 rounded-sm border border-[#3c3421] bg-[#071018] p-2 sm:p-3 lg:min-h-0 lg:grid-rows-2">
          <EloTeamRow side="Blue Team" lanes={round.lanes} />
          <EloTeamRow side="Red Team" lanes={round.enemyLanes} />
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 lg:[grid-template-columns:repeat(auto-fit,minmax(10.75rem,1fr))]">
          {round.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              disabled={submitted}
              className={cn(
                "group min-w-0 rounded-lg text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89b3c]/55 disabled:cursor-default sm:rounded-xl",
                !submitted && "hover:-translate-y-0.5 hover:ring-2 hover:ring-[#c89b3c]/45 hover:shadow-[0_0_22px_rgba(200,155,60,.18)]",
                answer === option && option === round.answerTier && "ring-2 ring-green-300/60",
                answer === option && option !== round.answerTier && "ring-2 ring-red-300/60",
                answer !== option && submitted && option === round.answerTier && "ring-2 ring-green-300/55"
              )}
            >
              <RankSplitLabel option={option} compact interactive={!submitted} />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <ResultPill submitted={submitted} correct={correct} answer={round.answerTier} />
          {submitted && (
            <Button type="button" variant="secondary" onClick={() => setResultModalOpen(true)}>
              Result
            </Button>
          )}
          {submitted && round.sourceMatch && (
            <MatchDataToggleButton expanded={matchDataExpanded} onClick={() => setMatchDataExpanded((current) => !current)} />
          )}
          {submitted && (
            <NextLobbyButton onClick={nextRound} />
          )}
        </div>
        {submitted && matchDataExpanded && <MatchProofCard sourceMatch={round.sourceMatch} />}
        {submitted && resultModalOpen && (
          <VerifiedAnswerModal
            correct={correct}
            selectedLabel={answer}
            answerLabel={round.answerTier}
            streak={streak}
            sourceMatch={round.sourceMatch}
            note={getGuessEloSourceRankNote(round.signalNotes)}
            onClose={() => setResultModalOpen(false)}
            onNext={nextRound}
            nextLabel="Next lobby"
          />
        )}
      </div>
      )}
    </PuzzleFrame>
  );
}

function guessEloAnswerKey(round: GuessEloRound) {
  return round.answerTier;
}

function getGuessEloSourceRankNote(notes: string[]) {
  return notes.find((note) => note.toLowerCase().includes("source player official ranked tier")) ?? notes[0];
}

function VerifiedAnswerModal({
  correct,
  selectedLabel,
  answerLabel,
  streak,
  sourceMatch,
  note,
  onClose,
  onNext,
  nextLabel
}: {
  correct: boolean;
  selectedLabel: string;
  answerLabel: string;
  streak: { current: number; best: number; played: number };
  sourceMatch?: GuessEloRound["sourceMatch"] | DodgeQueueRound["sourceMatch"] | ItemBuildChallenge["sourceMatch"];
  note?: string;
  onClose: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  useBodyScrollLock();
  const outcome = correct
    ? {
        eyebrow: "Victory",
        headline: "Correct read.",
        copy: "You called it clean. Keep the streak moving.",
        icon: <CheckCircle2 size={28} />,
        shell: "border-green-300/45 bg-[radial-gradient(circle_at_18%_10%,rgba(74,222,128,.26),transparent_34%),linear-gradient(135deg,rgba(20,83,45,.78),rgba(7,16,24,.96)_58%)]",
        ring: "border-green-200/60 bg-green-300/18 text-green-100 shadow-[0_0_34px_rgba(74,222,128,.24)]",
        text: "text-green-200"
      }
    : {
        eyebrow: "Defeat",
        headline: "Read missed.",
        copy: "The answer is revealed. Run the next lobby back.",
        icon: <XCircle size={28} />,
        shell: "border-red-300/45 bg-[radial-gradient(circle_at_18%_10%,rgba(248,113,113,.24),transparent_34%),linear-gradient(135deg,rgba(127,29,29,.76),rgba(7,16,24,.96)_58%)]",
        ring: "border-red-200/60 bg-red-300/18 text-red-100 shadow-[0_0_34px_rgba(248,113,113,.20)]",
        text: "text-red-200"
      };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_50%_18%,rgba(200,155,60,.16),transparent_32%),rgba(0,0,0,.76)] p-3 backdrop-blur-md sm:p-4">
      <div
        className={cn(
          "relative grid w-full gap-4 overscroll-contain rounded-3xl border bg-[linear-gradient(180deg,rgba(13,20,31,.98),rgba(5,8,13,.98))] p-3 shadow-[0_30px_110px_rgba(0,0,0,.72),inset_0_1px_0_rgba(255,255,255,.06)] transition-[max-width] sm:p-4",
          expanded
            ? "max-h-[calc(100dvh-1.5rem)] max-w-[min(92rem,calc(100vw-1.5rem))] overflow-y-auto border-[#c89b3c]/70 fine-scrollbar sm:max-h-[calc(100dvh-2rem)] sm:max-w-[min(92rem,calc(100vw-2rem))]"
            : "max-h-[calc(100dvh-1.5rem)] max-w-2xl overflow-y-auto border-[#c89b3c]/55 fine-scrollbar sm:max-h-[calc(100dvh-2rem)]"
        )}
      >
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className={cn("relative overflow-hidden rounded-2xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.07)] sm:p-5", outcome.shell)}>
          <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl border", outcome.ring)}>
                {outcome.icon}
              </div>
              <div className="min-w-0">
                <div className={cn("font-display text-xs font-black uppercase tracking-[0.16em]", outcome.text)}>{outcome.eyebrow}</div>
                <div className="mt-1 font-display text-3xl font-black leading-none tracking-tight text-white sm:text-4xl">{outcome.headline}</div>
                <p className="mt-2 text-sm font-medium text-white/72">{outcome.copy}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/12 bg-black/18 text-white/60 transition hover:border-white/28 hover:bg-white/10 hover:text-white"
              aria-label="Close result"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem]">
          <AnswerResultCard label="Your Answer" value={selectedLabel || "No answer"} tone={correct ? "good" : "bad"} />
          <AnswerResultCard label="Correct Answer" value={answerLabel} tone="gold" />
          <ResultStat label="Current Streak" value={String(streak.current)} detail={`Best ${streak.best}`} tone={correct ? "good" : "muted"} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-white/8 bg-white/[.035] p-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          {sourceMatch && (
            <MatchDataToggleButton expanded={expanded} onClick={() => setExpanded((current) => !current)} />
          )}
          <NextLobbyButton onClick={onNext} label={nextLabel} />
        </div>

        {expanded && (
          <div className="grid min-h-0 gap-3 pr-1">
            {note && (
              <div className="rounded-lg border border-[#2b2f38] bg-[#111722] p-3 text-sm text-[color:var(--muted)]">
                {note}
              </div>
            )}
            <MatchProofCard sourceMatch={sourceMatch} />
          </div>
        )}
      </div>
    </div>
  );
}

function useBodyScrollLock() {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, []);
}

function AnswerResultCard({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "gold" }) {
  const isRank = isRankOption(value);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.045)]",
        tone === "good" && "border-green-300/30 bg-[linear-gradient(180deg,rgba(22,101,52,.22),rgba(11,17,27,.92))]",
        tone === "bad" && "border-red-300/30 bg-[linear-gradient(180deg,rgba(127,29,29,.22),rgba(11,17,27,.92))]",
        tone === "gold" && "border-[#c89b3c]/42 bg-[linear-gradient(180deg,rgba(200,155,60,.18),rgba(11,17,27,.92))]"
      )}
    >
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />
      <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">{label}</div>
      <div className={cn("mt-3", isRank && "min-h-[5.5rem]")}>
        {isRank ? (
          <RankAnswerLabel option={value} />
        ) : (
          <CallAnswerLabel value={value} />
        )}
      </div>
    </div>
  );
}

function RankAnswerLabel({ option }: { option: string }) {
  const ranks = rankOptionParts(option);

  if (ranks.length === 0) {
    return (
      <div className="grid min-h-20 place-items-center rounded-xl border border-[#c89b3c]/34 bg-[#c89b3c]/10 px-3 text-center">
        <span className="font-display text-xl font-black uppercase tracking-normal text-[#f5c542]">{option}</span>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {ranks.map((rank) => {
        const visual = rankVisuals[rank];

        return (
          <div
            key={rank}
            className="relative min-w-0 overflow-hidden rounded-xl border px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.055)]"
            style={{ background: visual.background, borderColor: visual.border }}
          >
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1" style={{ background: visual.color }} />
            <div className="flex min-w-0 items-center">
              <span className="min-w-0 break-words font-display text-[15px] font-black uppercase leading-tight tracking-normal sm:text-base" style={{ color: visual.color }}>
                {rank}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CallAnswerLabel({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone =
    normalized === "queue"
      ? { color: "#86efac", background: "rgba(34, 197, 94, 0.14)", border: "rgba(134, 239, 172, 0.34)" }
      : normalized === "dodge"
        ? { color: "#fca5a5", background: "rgba(239, 68, 68, 0.14)", border: "rgba(252, 165, 165, 0.34)" }
        : { color: "#f5c542", background: "rgba(200, 155, 60, 0.12)", border: "rgba(200, 155, 60, 0.34)" };

  return (
    <div
      className="grid min-h-20 place-items-center rounded-xl border px-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"
      style={{ background: tone.background, borderColor: tone.border }}
    >
      <span className="font-display text-2xl font-black uppercase tracking-[0.08em]" style={{ color: tone.color }}>
        {value}
      </span>
    </div>
  );
}

function ResultStat({
  label,
  value,
  detail,
  tone = "muted"
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "good" | "bad" | "gold" | "muted";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.045)]",
        tone === "good" && "border-green-300/30 bg-[linear-gradient(180deg,rgba(22,101,52,.24),rgba(11,17,27,.92))]",
        tone === "bad" && "border-red-300/30 bg-[linear-gradient(180deg,rgba(127,29,29,.24),rgba(11,17,27,.92))]",
        tone === "gold" && "border-[#c89b3c]/42 bg-[linear-gradient(180deg,rgba(200,155,60,.18),rgba(11,17,27,.92))]",
        tone === "muted" && "border-white/10 bg-[#0b111b]"
      )}
    >
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />
      <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-display text-2xl font-extrabold",
          tone === "good" && "text-green-300",
          tone === "bad" && "text-red-300",
          tone === "gold" && "text-[#f5c542]",
          tone === "muted" && "text-white"
        )}
        title={value}
      >
        {value}
      </div>
      {detail && <div className="mt-1 text-xs text-[color:var(--muted)]">{detail}</div>}
    </div>
  );
}

function MatchDataToggleButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant={expanded ? "secondary" : "primary"}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-xl px-4 font-display text-sm font-black shadow-[0_10px_28px_rgba(0,0,0,.20)]",
        !expanded && "border-[#c89b3c]/70 bg-[linear-gradient(180deg,#f5c542,#c9932e)] text-[#090d14] hover:bg-[linear-gradient(180deg,#ffe27a,#d6a039)]",
        expanded && "border-[#74ecff]/30 bg-[#0d1a25] text-[#d8fbff] hover:border-[#74ecff]/55 hover:bg-[#132334]"
      )}
    >
      {expanded ? "Hide match data" : "View match data"}
    </Button>
  );
}

function NextLobbyButton({ onClick, label = "Next lobby" }: { onClick: () => void; label?: string }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className="min-h-12 rounded-xl border-[#ffe27a]/80 bg-[linear-gradient(180deg,#ffe27a_0%,#f6bd38_58%,#c88717_100%)] px-5 text-sm font-black text-[#090d14] shadow-[0_12px_34px_rgba(246,189,56,.28),inset_0_1px_0_rgba(255,255,255,.55)] hover:translate-y-[-1px] hover:bg-[linear-gradient(180deg,#fff0a3_0%,#f6c94a_58%,#d99a1c_100%)] hover:shadow-[0_16px_42px_rgba(246,189,56,.34),inset_0_1px_0_rgba(255,255,255,.6)]"
    >
      <span>{label}</span>
      <ArrowRight size={16} strokeWidth={2.8} />
    </Button>
  );
}

function MatchProofCard({ sourceMatch }: { sourceMatch?: GuessEloRound["sourceMatch"] | DodgeQueueRound["sourceMatch"] | ItemBuildChallenge["sourceMatch"] }) {
  const [copied, setCopied] = useState(false);
  const [remoteMatchData, setRemoteMatchData] = useState<VerifiedMatchData | undefined>(sourceMatch?.matchData);
  const [loadingMatchData, setLoadingMatchData] = useState(false);
  const [matchDataError, setMatchDataError] = useState("");

  useEffect(() => {
    setRemoteMatchData(sourceMatch?.matchData);
    setMatchDataError("");

    if (!sourceMatch || sourceMatch.matchData) {
      setLoadingMatchData(false);
      return;
    }

    let cancelled = false;
    const matchId = sourceMatch.matchId;

    async function loadMatchData() {
      setLoadingMatchData(true);

      try {
        const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, { cache: "force-cache" });
        const body = (await response.json()) as { matchData?: VerifiedMatchData; error?: string };

        if (cancelled) {
          return;
        }

        if (!response.ok || !body.matchData) {
          throw new Error(body.error || "Match proof unavailable.");
        }

        setRemoteMatchData(body.matchData);
      } catch (error) {
        if (!cancelled) {
          setMatchDataError(error instanceof Error ? error.message : "Match proof unavailable.");
        }
      } finally {
        if (!cancelled) {
          setLoadingMatchData(false);
        }
      }
    }

    void loadMatchData();

    return () => {
      cancelled = true;
    };
  }, [sourceMatch]);

  if (!sourceMatch) {
    return null;
  }

  const match = sourceMatch;
  const matchData = match.matchData ?? remoteMatchData;

  async function copyMatchId() {
    await navigator.clipboard.writeText(match.matchId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="rounded-lg border border-[#3c3421] bg-[#0b111b] p-3 text-sm">
      <div className="text-xs uppercase text-[#c89b3c]">Verified match proof</div>
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-[color:var(--muted)]" title={match.matchId}>
          {match.matchId}
        </div>
        <button
          type="button"
          onClick={copyMatchId}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 font-display text-[10px] font-bold uppercase tracking-[0.08em] text-[#f0d99d] transition hover:border-[#c89b3c]/60 hover:bg-[#c89b3c]/12"
        >
          <Copy size={13} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {match.sourcePlayer && <div className="mt-1 text-xs text-[color:var(--muted)]">Source player: {match.sourcePlayer}</div>}
      {matchData ? (
        <VerifiedMatchReport match={matchData} />
      ) : loadingMatchData ? (
        <div className="mt-3 rounded-lg border border-[#2b2f38] bg-[#111722] p-2 text-xs text-[color:var(--muted)]">
          Loading Riot Match-V5 proof...
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-[#2b2f38] bg-[#111722] p-2 text-xs text-[color:var(--muted)]">
          {matchDataError || "Match details unavailable, but the exact Riot Match-V5 ID is shown above."}
        </div>
      )}
    </div>
  );
}

function VerifiedMatchReport({ match }: { match: VerifiedMatchData }) {
  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-[#2b2f38] bg-[#050607]/80 p-3">
      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.08em] text-[color:var(--muted)]">
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Queue {match.queueId}</span>
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">{match.gameMode}</span>
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Map {match.mapId}</span>
        {match.gameDurationSeconds && <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">{formatMatchDuration(match.gameDurationSeconds)}</span>}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {match.teams.map((team) => (
          <MatchTeamPanel key={team.teamId} team={team} />
        ))}
      </div>
    </div>
  );
}

function MatchTeamPanel({ team }: { team: VerifiedMatchData["teams"][number] }) {
  return (
    <div className={cn("rounded-lg border bg-[#0b111b]", team.win ? "border-green-400/45" : "border-red-400/35")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3">
        <div>
          <div className="font-display text-lg font-bold text-white">{team.name}</div>
          <div className={cn("text-xs font-bold uppercase tracking-[0.1em]", team.win ? "text-green-300" : "text-red-300")}>{team.win ? "Victory" : "Defeat"}</div>
        </div>
        <div className="flex items-center gap-1">
          {team.bans.slice(0, 5).map((champion) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={champion.id} src={champion.squareUrl} alt={champion.name} title={`Ban: ${champion.name}`} className="h-7 w-7 rounded-sm border border-[#3c3421] object-cover grayscale" />
          ))}
        </div>
      </div>
      <div className="grid gap-1 p-2">
        {team.participants.map((participant) => (
          <MatchParticipantRow key={`${team.teamId}:${participant.role}`} participant={participant} />
        ))}
      </div>
    </div>
  );
}

function MatchParticipantRow({ participant }: { participant: VerifiedMatchData["teams"][number]["participants"][number] }) {
  return (
    <div className="grid gap-2 rounded-md border border-white/10 bg-[#111722] p-2 md:grid-cols-[2.8rem_minmax(0,1.15fr)_5.5rem_minmax(8rem,1fr)] md:items-center">
      <div className="flex items-center gap-2 md:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={participant.champion.squareUrl} alt="" className="h-11 w-11 rounded-sm border border-[#3c3421] object-cover" />
        <div className="md:hidden">
          <div className="font-bold">{participant.champion.name}</div>
          <div className="text-xs uppercase text-[#c89b3c]">{participant.role}</div>
        </div>
      </div>
      <div className="min-w-0">
        <div className="hidden truncate font-bold md:block">{participant.champion.name}</div>
        <div className="text-xs uppercase text-[#c89b3c]">{participant.role} - Lv {participant.championLevel}</div>
        {participant.playerName && (
          <div title={participant.playerName} className="truncate text-xs font-semibold text-[#9fb7d5]">
            {participant.playerName}
          </div>
        )}
        <div className="mt-1 flex gap-1">
          {participant.spells.map((spell) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={spell.id} src={spell.iconUrl} alt={spell.name} title={spell.name} className="h-6 w-6 rounded-sm border border-[#3c3421]" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center text-xs md:block md:text-right">
        <div className="font-display text-base font-bold text-white">
          {participant.kills}/{participant.deaths}/{participant.assists}
        </div>
        <div className="text-[color:var(--muted)]">{participant.cs} CS</div>
        <div className="text-[color:var(--muted)]">{compactNumber(participant.gold)}g</div>
      </div>
      <div className="grid gap-2">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, index) => {
            const item = participant.items[index];

            return item ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={item.id} src={item.imageUrl} alt="" title={`Item ${item.id}`} className="aspect-square w-full rounded-sm border border-[#3c3421] bg-[#050607] object-contain" />
            ) : (
              <div key={index} className="aspect-square rounded-sm border border-white/10 bg-[#050607]" />
            );
          })}
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-[11px] text-[color:var(--muted)]">
          <span>{compactNumber(participant.damageToChampions)} dmg</span>
          <span>{participant.visionScore} vision</span>
        </div>
      </div>
    </div>
  );
}

function formatMatchDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);

  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function compactNumber(value: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

const ELO_TEAM_ART = {
  blue: "https://raw.communitydragon.org/latest/game/assets/characters/sru_orderminionmelee/skins/base/orderminion_melee_tx_cm.png",
  red: "https://raw.communitydragon.org/latest/game/assets/characters/sru_chaosminionmelee/skins/base/chaosminion_melee_tx_cm.png"
} as const;

const DRAFT_TEAM_ART = {
  blue: "https://raw.communitydragon.org/latest/game/assets/characters/nexus/hud/nexus_blue_square.png",
  red: "https://raw.communitydragon.org/latest/game/assets/characters/nexus/hud/nexus_red_square.png"
} as const;

function EloTeamRow({ side, lanes }: { side: string; lanes: EloRound["lanes"] }) {
  const teamTone = side.toLowerCase().includes("blue") ? "blue" : "red";
  const sideWords = side.split(" ");

  return (
    <div className="grid grid-cols-2 gap-1.5 sm:min-h-0 sm:grid-cols-[5rem_repeat(5,minmax(0,1fr))] sm:gap-2">
      <div
        data-elo-team-label={teamTone}
        className={cn(
          "font-display relative col-span-2 min-h-14 overflow-hidden rounded-sm border text-center text-[11px] font-black uppercase tracking-[0.08em] text-[#f4d27a] sm:col-span-1 sm:min-h-0 sm:text-xs",
          teamTone === "blue" ? "border-[#60a5fa]/35 bg-[#061528]" : "border-[#f87171]/35 bg-[#1c0b0c]"
        )}
        style={{
          backgroundImage: `url(${ELO_TEAM_ART[teamTone]})`,
          backgroundPosition: "center",
          backgroundSize: "cover"
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(5,6,7,.98),rgba(5,6,7,.68)_52%,rgba(5,6,7,.2))]" />
        <div className={cn("absolute inset-0", teamTone === "blue" ? "bg-blue-500/12" : "bg-red-500/12")} />
        <div className="relative grid h-full min-h-14 place-items-center px-1 py-2 sm:min-h-full">
          <span className="leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,.9)]">
            {sideWords.map((word) => (
              <span key={word} className="block">
                {word}
              </span>
            ))}
          </span>
        </div>
      </div>
      {lanes.map((lane) => (
        <div key={`${side}:${lane.role}`} className="relative min-h-24 overflow-hidden rounded-sm border border-[#3c3421] bg-[#111722] sm:min-h-0">
          <div className="absolute inset-0 bg-cover bg-center opacity-48" style={{ backgroundImage: `url(${lane.champion.splashUrl})` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050607] via-[#050607]/55 to-transparent" />
          <div className="relative flex h-full min-h-0 flex-col justify-end p-2 sm:p-2">
            <span className="w-fit rounded-sm border border-[#c89b3c]/35 bg-[#c89b3c]/12 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-[#c89b3c]">
              {displayLaneLabel(lane.role)}
            </span>
            <span className="truncate text-sm font-bold leading-tight sm:text-base">{lane.champion.name}</span>
            {lane.playerName && (
              <span title={lane.playerName} className="mt-0.5 truncate text-[11px] font-semibold leading-tight text-[#9fb7d5]">
                {lane.playerName}
              </span>
            )}
            <div className="mt-1 flex gap-1">
              {lane.spells.map((spell) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={spell.id} src={spell.iconUrl} alt={spell.name} title={spell.name} className="h-6 w-6 rounded-sm border border-[#3c3421] sm:h-7 sm:w-7" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DodgeQueueGame({
  challenge,
  username = "Guest",
  onNeedMoreRounds
}: {
  challenge: DodgeQueueChallenge;
  username?: string;
  onNeedMoreRounds?: () => void;
}) {
  const generatedRounds = useMemo(() => createDodgeQueueRounds(challenge), [challenge]);
  const rounds = useRandomizedRounds(generatedRounds, "dodge-queue", username);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [matchDataExpanded, setMatchDataExpanded] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("dodge-queue", username);
  const requestMoreRoundsIfExhausted = useRequestMoreRoundsOnExhaustion(rounds.length, onNeedMoreRounds);
  const round = rounds[roundIndex % rounds.length];
  const correct = submitted && answer === round.answer;

  function lockCall(call: "dodge" | "queue") {
    if (submitted) {
      return;
    }

    setAnswer(call);
    setSubmitted(true);
    setResultModalOpen(true);
    recordStreak(call === round.answer, {
      performanceQuality: call === round.answer ? 0.8 : 0.2,
      roundId: round.id,
      metadata: {
        selectedCall: call,
        answerCall: round.answer,
        sourceMatchId: round.sourceMatch?.matchId
      }
    });
  }

  function nextLobby() {
    setRoundIndex((current) => {
      const nextIndex = current + 1;
      requestMoreRoundsIfExhausted(nextIndex);
      return nextIndex;
    });
    setAnswer("");
    setSubmitted(false);
    setResultModalOpen(false);
    setMatchDataExpanded(false);
  }

  return (
    <PuzzleFrame
      icon={<CircleSlash size={18} />}
      title="Dodge or Queue"
      headerAccessory={<InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />}
      playAreaDepth
    >
      {round.unavailableReason ? (
        <VerifiedDataUnavailable reason={round.unavailableReason} />
      ) : (
      <div className="grid flex-1 gap-2 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto_auto] lg:gap-4">
        <DraftScreen
          blueName="Your Team"
          redName="Enemy Team"
          bluePicks={applyLaneLabels(round.allyTeam.map((champion, index) => championToOption(champion, round.allySpells[index], round.allyPlayerNames?.[index])), laneLabels)}
          redPicks={applyLaneLabels(round.enemyTeam.map((champion, index) => championToOption(champion, round.enemySpells[index], round.enemyPlayerNames?.[index])), laneLabels)}
          blueBans={round.allyBans.map((champion) => championToOption(champion))}
          redBans={round.enemyBans.map((champion) => championToOption(champion))}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => lockCall("dodge")}
            disabled={submitted}
            className={cn(
              "font-display min-h-11 rounded-sm border px-3 text-base font-extrabold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/55 disabled:cursor-default sm:min-h-14 sm:px-4 sm:text-lg",
              !submitted && "hover:-translate-y-0.5 hover:ring-2 hover:ring-red-300/45 hover:shadow-[0_0_22px_rgba(248,113,113,.18)] hover:brightness-110",
              answer === "dodge"
                ? "border-red-300 bg-red-500 text-white ring-2 ring-red-300/55"
                : "border-red-400/35 bg-red-500/14 text-red-100 hover:bg-red-500/24"
            )}
          >
            Dodge
          </button>
          <button
            type="button"
            onClick={() => lockCall("queue")}
            disabled={submitted}
            className={cn(
              "font-display min-h-11 rounded-sm border px-3 text-base font-extrabold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300/55 disabled:cursor-default sm:min-h-14 sm:px-4 sm:text-lg",
              !submitted && "hover:-translate-y-0.5 hover:ring-2 hover:ring-green-300/45 hover:shadow-[0_0_22px_rgba(74,222,128,.18)] hover:brightness-110",
              answer === "queue"
                ? "border-green-300 bg-green-500 text-[#071018] ring-2 ring-green-300/55"
                : "border-green-400/35 bg-green-500/14 text-green-100 hover:bg-green-500/24"
            )}
          >
            Queue
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <ResultPill submitted={submitted} correct={correct} answer={round.answer === "queue" ? "Queue" : "Dodge"} />
          {submitted && (
            <Button type="button" variant="secondary" onClick={() => setResultModalOpen(true)}>
              Result
            </Button>
          )}
          {submitted && round.sourceMatch && (
            <MatchDataToggleButton expanded={matchDataExpanded} onClick={() => setMatchDataExpanded((current) => !current)} />
          )}
          {submitted && (
            <NextLobbyButton onClick={nextLobby} />
          )}
        </div>
        {submitted && matchDataExpanded && <MatchProofCard sourceMatch={round.sourceMatch} />}
        {submitted && resultModalOpen && (
          <VerifiedAnswerModal
            correct={correct}
            selectedLabel={answer === "queue" ? "Queue" : "Dodge"}
            answerLabel={round.answer === "queue" ? "Queue" : "Dodge"}
            streak={streak}
            sourceMatch={round.sourceMatch}
            note={round.explanation}
            onClose={() => setResultModalOpen(false)}
            onNext={nextLobby}
            nextLabel="Next lobby"
          />
        )}
      </div>
      )}
    </PuzzleFrame>
  );
}

function createDodgeQueueRounds(base: DodgeQueueChallenge): DodgeQueueRound[] {
  return base.rounds && base.rounds.length > 0 ? base.rounds : [base];
}

function PuzzleFrame({
  icon,
  title,
  kicker,
  headerAccessory,
  children,
  playAreaDepth = false
}: {
  icon: ReactNode;
  title: string;
  kicker?: string;
  headerAccessory?: ReactNode;
  children: ReactNode;
  playAreaDepth?: boolean;
}) {
  const content = (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[#c89b3c]">{icon}</span>
          <h2 className="truncate text-lg font-semibold sm:text-xl">{title}</h2>
          {kicker && <span className="text-xs text-[color:var(--muted)] sm:text-sm">{kicker}</span>}
        </div>
        {headerAccessory ? <div className="flex min-w-0 shrink-0">{headerAccessory}</div> : null}
      </div>
      {children}
    </>
  );

  return (
    <section
      className={cn(
        "flex h-auto min-h-[calc(100dvh-5rem)] flex-col gap-2 rounded-lg border border-[#3c3421] bg-[#071018] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] sm:gap-3 sm:p-4 lg:h-full lg:min-h-0 lg:rounded-sm",
        playAreaDepth && "play-area-depth bg-transparent shadow-none"
      )}
    >
      {playAreaDepth ? <div className="play-area-content flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">{content}</div> : content}
    </section>
  );
}

function VerifiedDataUnavailable({ reason }: { reason: string }) {
  return (
    <div
      className="grid min-h-56 flex-1 place-items-center rounded-xl border border-[#3c3421] bg-[radial-gradient(circle_at_50%_0%,rgba(200,155,60,.12),transparent_34%),linear-gradient(180deg,#0f1724,#071018)] p-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_22px_70px_rgba(0,0,0,.32)] sm:min-h-80 sm:p-6"
      aria-label={reason}
    >
      <div className="max-w-lg">
        <div className="font-display text-xl font-bold text-[#c89b3c] sm:text-2xl">Rounds syncing</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 min-h-10 rounded-md border border-[#c89b3c]/45 bg-[#c89b3c] px-4 font-display text-sm font-bold text-[#071018] shadow-[0_12px_30px_rgba(200,155,60,.22)] transition hover:brightness-110"
        >
          Refresh live data
        </button>
      </div>
    </div>
  );
}

function championSplashPosition(name: string) {
  const positions: Record<string, string> = {
    Garen: "62% 24%",
    Lux: "50% 28%",
    Yasuo: "48% 22%",
    Ahri: "52% 24%",
    Caitlyn: "50% 24%",
    Ezreal: "48% 24%",
    Jinx: "48% 28%",
    Riven: "48% 22%"
  };

  return positions[name] ?? "50% 28%";
}

function DraftScreen({
  blueName,
  redName,
  bluePicks,
  redPicks,
  blueBans,
  redBans,
  hiddenLabel = "Locked"
}: {
  blueName: string;
  redName: string;
  bluePicks: Array<OptionItem | undefined>;
  redPicks: Array<OptionItem | undefined>;
  blueBans: Array<OptionItem | undefined>;
  redBans: Array<OptionItem | undefined>;
  hiddenLabel?: string;
}) {
  return (
    <div className="play-panel-depth grid gap-2 rounded-sm border border-[#3c3421] p-2 sm:p-3 md:min-h-0 md:grid-cols-[1fr_4rem_1fr] xl:grid-cols-[1fr_5rem_1fr]">
      <DraftTeam side="blue" name={blueName} picks={bluePicks} bans={blueBans} hiddenLabel={hiddenLabel} />
      <div className="grid place-items-center text-center">
        <MatchupVsMark compact />
      </div>
      <DraftTeam side="red" name={redName} picks={redPicks} bans={redBans} hiddenLabel={hiddenLabel} />
    </div>
  );
}

function DraftTeam({
  side,
  name,
  picks,
  bans,
  hiddenLabel
}: {
  side: "blue" | "red";
  name: string;
  picks: Array<OptionItem | undefined>;
  bans: Array<OptionItem | undefined>;
  hiddenLabel: string;
}) {
  return (
    <div className="grid gap-1.5 md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)] md:gap-3">
      <div className={cn("flex items-center gap-4 sm:gap-5", side === "red" ? "justify-end" : "justify-start")}>
        {side === "red" && <BanCluster bans={bans} />}
        <DraftTeamNamePlate side={side} name={name} />
        {side === "blue" && <BanCluster bans={bans} />}
      </div>
      <div className="grid gap-1.5 md:min-h-0 md:grid-rows-5 md:gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <DraftPickCard key={index} side={side} pick={picks[index]} hiddenLabel={hiddenLabel} />
        ))}
      </div>
    </div>
  );
}

function DraftTeamNamePlate({ side, name }: { side: "blue" | "red"; name: string }) {
  const teamTone = side === "blue" ? "blue" : "red";

  return (
    <div
      className={cn(
        "font-display relative grid min-h-10 w-[8.5rem] shrink-0 place-items-center overflow-hidden rounded-sm border text-center text-sm font-black uppercase tracking-[0.08em] text-[#f4d27a] sm:min-h-11 sm:w-[10rem] sm:text-base xl:w-[11rem]",
        teamTone === "blue" ? "border-[#60a5fa]/35 bg-[#061528]" : "border-[#f87171]/35 bg-[#1c0b0c]"
      )}
      style={{
        backgroundImage: `url(${DRAFT_TEAM_ART[teamTone]})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "58% auto"
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.12),transparent_52%),linear-gradient(90deg,rgba(5,6,7,.96),rgba(5,6,7,.68)_48%,rgba(5,6,7,.96))]" />
      <div className={cn("absolute inset-0", teamTone === "blue" ? "bg-blue-500/16" : "bg-red-500/16")} />
      <span className="relative whitespace-nowrap leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,.95)]">{name}</span>
    </div>
  );
}

function BanCluster({ bans }: { bans: Array<OptionItem | undefined> }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <BanIcon key={index} pick={bans[index]} />
      ))}
    </div>
  );
}

function DraftPickCard({ side, pick, hiddenLabel }: { side: "blue" | "red"; pick?: OptionItem; hiddenLabel: string }) {
  const mirrored = side === "blue";

  return (
    <div className="play-card-depth relative min-h-20 overflow-hidden rounded-sm border border-[#3c3421] bg-[#111722] sm:min-h-24">
      {pick?.splashUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-38"
          style={{
            backgroundImage: `url(${pick.splashUrl})`,
            backgroundPosition: championSplashPosition(pick.label)
          }}
        />
      )}
      <div
        className={cn(
          "absolute inset-0",
          mirrored
            ? "bg-[linear-gradient(270deg,rgba(5,6,7,.96)_0%,rgba(5,6,7,.72)_42%,rgba(5,6,7,.38)_100%)]"
            : "bg-[linear-gradient(90deg,rgba(5,6,7,.96)_0%,rgba(5,6,7,.72)_42%,rgba(5,6,7,.38)_100%)]"
        )}
      />
      <div className={cn("absolute inset-x-0 bottom-0 h-px", mirrored ? "bg-gradient-to-l from-[#c89b3c]/45 via-transparent to-transparent" : "bg-gradient-to-r from-[#c89b3c]/45 via-transparent to-transparent")} />

      <div
        className={cn(
          "relative grid h-full min-h-20 items-center gap-2 p-2 sm:min-h-24 sm:gap-3 sm:p-2.5",
          mirrored
            ? "grid-cols-[auto_minmax(0,1fr)_3.25rem] sm:grid-cols-[auto_minmax(0,1fr)_4rem]"
            : "grid-cols-[3.25rem_minmax(0,1fr)_auto] sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
        )}
      >
        {mirrored && (pick?.spells ? <DraftSpellStack spells={pick.spells} align="left" /> : <DraftSpellSpacer align="left" />)}

        {!mirrored && (
        <div className="relative h-12 w-12 overflow-hidden rounded-sm border border-[#3c3421] bg-[#071018] shadow-[0_10px_26px_rgba(0,0,0,.35)] sm:h-16 sm:w-16">
          {pick?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pick.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-sm text-[#c89b3c]">?</div>
          )}
        </div>
        )}

        <div className={cn("min-w-0", mirrored && "text-right")}>
          <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", mirrored ? "justify-end" : "justify-start")}>
            <span className="rounded-sm border border-[#c89b3c]/35 bg-[#c89b3c]/12 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-[#c89b3c]">
              {displayLaneLabel(pick?.sublabel)}
            </span>
          </div>
          <div className="mt-1 truncate font-display text-base font-black leading-none text-white sm:text-xl">{pick?.label ?? hiddenLabel}</div>
          {pick?.playerName && (
            <div title={pick.playerName} className="mt-1 truncate text-[11px] font-semibold tracking-[0.02em] text-[#9fb7d5] sm:text-xs">
              {pick.playerName}
            </div>
          )}
        </div>

        {mirrored ? (
          <div className="relative h-12 w-12 overflow-hidden rounded-sm border border-[#3c3421] bg-[#071018] shadow-[0_10px_26px_rgba(0,0,0,.35)] sm:h-16 sm:w-16">
            {pick?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pick.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-sm text-[#c89b3c]">?</div>
            )}
          </div>
        ) : (
          pick?.spells ? <DraftSpellStack spells={pick.spells} align="right" /> : <DraftSpellSpacer align="right" />
        )}
      </div>
    </div>
  );
}

function DraftSpellStack({ spells, align }: { spells: SummonerSpellRef[]; align: "left" | "right" }) {
  return (
    <div className={cn("grid gap-1", align === "right" ? "justify-items-end" : "justify-items-start")}>
      <div className="grid gap-1">
        {spells.map((spell) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={spell.id} src={spell.iconUrl} alt={spell.name} title={spell.name} className="h-6 w-6 rounded-sm border border-[#3c3421] bg-[#050607] shadow-[0_8px_18px_rgba(0,0,0,.32)] sm:h-7 sm:w-7" />
        ))}
      </div>
    </div>
  );
}

function DraftSpellSpacer({ align }: { align: "left" | "right" }) {
  return <div aria-hidden="true" className={cn("h-[3.25rem] w-6 sm:h-[3.75rem] sm:w-7", align === "right" ? "justify-self-end" : "justify-self-start")} />;
}

function BanIcon({ pick }: { pick?: OptionItem }) {
  return (
    <div className="relative h-7 w-7 overflow-hidden rounded-sm border border-[#3c3421] bg-[#111722]">
      {pick?.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pick.imageUrl} alt="" className="h-full w-full object-cover grayscale" />
      )}
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute left-1 top-1 h-[calc(100%-0.5rem)] w-px rotate-45 bg-red-400" />
    </div>
  );
}

function championToOption(champion: PublicChampion, spells?: SummonerSpellRef[], playerName?: string): OptionItem {
  return {
    id: champion.id,
    label: champion.name,
    sublabel: champion.roles.join(" / "),
    imageUrl: champion.squareUrl,
    splashUrl: champion.splashUrl,
    spells,
    ...(playerName ? { playerName } : {})
  };
}

const laneLabels = ["Top", "Jungle", "Mid", "Bot", "Supp"] as const;
type LaneLabel = (typeof laneLabels)[number];

function displayLaneLabel(label?: string) {
  const normalized = (label ?? "Lane").trim().toLowerCase();

  if (["top", "TOP"].includes(label ?? "") || normalized === "top") return "TOP";
  if (normalized === "jungle" || normalized === "jg") return "JUNGLE";
  if (normalized === "mid" || normalized === "middle") return "MID";
  if (normalized === "bot" || normalized === "bottom" || normalized === "adc") return "BOTTOM";
  if (normalized === "supp" || normalized === "support" || normalized === "utility") return "SUPPORT";

  return (label ?? "Lane").toUpperCase();
}

const laneRoleWeights: Record<LaneLabel, string[]> = {
  Top: ["Fighter", "Tank", "Assassin", "Mage"],
  Jungle: ["Assassin", "Fighter", "Tank", "Mage"],
  Mid: ["Mage", "Assassin", "Fighter", "Marksman"],
  Bot: ["Marksman", "Mage"],
  Supp: ["Support", "Tank", "Mage"]
};

const laneOverrides: Record<string, LaneLabel[]> = {
  aatrox: ["Top"],
  alistar: ["Supp"],
  brand: ["Supp", "Mid", "Jungle"],
  corki: ["Mid"],
  ezreal: ["Bot"],
  fiora: ["Top"],
  kaisa: ["Bot"],
  nidalee: ["Jungle"],
  rell: ["Jungle", "Supp"],
  yasuo: ["Mid", "Bot", "Top"],
  yuumi: ["Supp"]
};

function applyLaneLabels(picks: Array<OptionItem | undefined>, lanes?: readonly string[]): Array<OptionItem | undefined> {
  if (!lanes || lanes.length === 0) {
    return assignLaneLabels(picks);
  }

  return picks.map((pick, index) => (pick ? { ...pick, sublabel: lanes[index] ?? "Lane" } : undefined));
}

function assignLaneLabels(picks: Array<OptionItem | undefined>): Array<OptionItem | undefined> {
  const lanes = laneLabels.slice(0, picks.length);
  const allAssignments = permute(lanes);
  let bestAssignment = lanes;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const assignment of allAssignments) {
    const score = picks.reduce((total, pick, index) => total + laneScore(pick, assignment[index]), 0);

    if (score > bestScore) {
      bestScore = score;
      bestAssignment = assignment;
    }
  }

  return picks.map((pick, index) => (pick ? { ...pick, sublabel: bestAssignment[index] } : undefined));
}

function laneScore(pick: OptionItem | undefined, lane: LaneLabel) {
  if (!pick) {
    return 1;
  }

  const override = laneOverrides[normalize(pick.label)];

  if (override) {
    const overrideIndex = override.indexOf(lane);
    return overrideIndex >= 0 ? 100 - overrideIndex * 6 : -60;
  }

  const roles = (pick.sublabel ?? "").split("/").map((role) => role.trim());
  return laneRoleWeights[lane].reduce((total, role, index) => total + (roles.includes(role) ? 14 - index * 2 : 0), 0);
}

function permute<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items];
  }

  return items.flatMap((item, index) =>
    permute([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])
  );
}

function getItemName(itemsList: GameItem[], id: string) {
  return itemsList.find((item) => item.id === id)?.name ?? "Unknown item";
}

function createEloRounds(base: GuessEloChallenge): EloRound[] {
  return base.rounds && base.rounds.length > 0 ? base.rounds : [base];
}

const rankVisuals: Record<string, { color: string; background: string; border: string }> = {
  Iron: { color: "#cbd5df", background: "rgba(99, 110, 123, 0.18)", border: "rgba(203, 213, 223, 0.24)" },
  Bronze: { color: "#d59a62", background: "rgba(166, 106, 58, 0.20)", border: "rgba(213, 154, 98, 0.28)" },
  Silver: { color: "#e5eef5", background: "rgba(190, 205, 214, 0.18)", border: "rgba(229, 238, 245, 0.26)" },
  Gold: { color: "#f5c542", background: "rgba(239, 184, 65, 0.18)", border: "rgba(245, 197, 66, 0.30)" },
  Platinum: { color: "#68e3d4", background: "rgba(57, 193, 181, 0.18)", border: "rgba(104, 227, 212, 0.28)" },
  Emerald: { color: "#43e68b", background: "rgba(25, 176, 103, 0.18)", border: "rgba(67, 230, 139, 0.28)" },
  Diamond: { color: "#83ccff", background: "rgba(75, 172, 255, 0.18)", border: "rgba(131, 204, 255, 0.30)" },
  Master: { color: "#d79aff", background: "rgba(178, 88, 255, 0.18)", border: "rgba(215, 154, 255, 0.30)" },
  Grandmaster: { color: "#ff7a86", background: "rgba(239, 82, 96, 0.18)", border: "rgba(255, 122, 134, 0.30)" },
  Challenger: { color: "#74ecff", background: "rgba(86, 216, 255, 0.18)", border: "rgba(116, 236, 255, 0.30)" }
};

function RankSplitLabel({ option, compact = false, interactive = false }: { option: string; compact?: boolean; interactive?: boolean }) {
  const ranks = rankOptionParts(option);

  if (ranks.length === 0) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-lg border border-[#c89b3c]/28 bg-[#c89b3c]/10 px-2 text-center transition duration-150 sm:rounded-xl sm:px-3",
          interactive && "group-hover:border-[#c89b3c]/70 group-hover:bg-[#c89b3c]/14 group-hover:brightness-110",
          compact ? "min-h-11 sm:min-h-[3.25rem]" : "min-h-16 sm:min-h-20"
        )}
      >
        <span className={cn("font-display font-black uppercase tracking-[0.06em] text-[#f5c542] sm:tracking-[0.08em]", compact ? "text-xs sm:text-sm" : "text-lg sm:text-2xl")}>{option}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative grid overflow-hidden rounded-lg border border-white/10 bg-[#071018] shadow-[inset_0_1px_0_rgba(255,255,255,.04)] transition duration-150 sm:rounded-xl",
        interactive && "group-hover:border-[#c89b3c]/65 group-hover:brightness-110 group-hover:shadow-[0_0_18px_rgba(200,155,60,.14),inset_0_1px_0_rgba(255,255,255,.06)]",
        ranks.length > 1 && "grid-cols-2",
        compact ? "min-h-11 sm:min-h-[3.25rem]" : "min-h-16 sm:min-h-20"
      )}
    >
      {ranks.map((rank) => {
        const visual = rankVisuals[rank];

        return (
          <div
            key={rank}
            className="relative grid place-items-center border-l border-white/10 px-1 py-1.5 text-center first:border-l-0 sm:px-1.5 sm:py-2"
            style={{ background: visual.background, borderColor: visual.border }}
          >
            <span
              className={cn(
                "font-display font-black leading-none",
                compact
                  ? "text-[11px] normal-case tracking-normal min-[390px]:text-xs sm:text-[13px] xl:text-sm"
                  : "text-base uppercase tracking-[0.04em] sm:text-2xl sm:tracking-[0.08em]"
              )}
              style={{ color: visual.color }}
            >
              {rank}
            </span>
          </div>
        );
      })}
      {ranks.length > 1 && <div className="pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-white/12" />}
    </div>
  );
}

function isRankOption(value: string) {
  return rankOptionParts(value).length > 0;
}

function rankOptionParts(option: string) {
  return option
    .split("/")
    .map((rank) => rank.trim())
    .filter((rank) => Boolean(rankVisuals[rank]));
}

function ResultPill({ submitted, correct, answer }: { submitted: boolean; correct: boolean; answer?: string }) {
  if (!submitted) {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm",
        correct ? "border-green-400/40 bg-green-500/15 text-green-100" : "border-red-400/40 bg-red-500/15 text-red-100"
      )}
    >
      {correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      {correct ? "Correct" : `Answer: ${answer ?? "try again"}`}
    </div>
  );
}

function normalize(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function seededShuffle<T extends { id: string }>(items: T[], seed: string) {
  return [...items].sort((a, b) => {
    const aHash = hashString(`${seed}:${a.id}`);
    const bHash = hashString(`${seed}:${b.id}`);

    return aHash - bHash || a.id.localeCompare(b.id);
  });
}
