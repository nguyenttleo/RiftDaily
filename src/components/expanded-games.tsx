"use client";

import { ArrowRight, CheckCircle2, CircleSlash, Copy, PackageSearch, Split, Swords, TrendingUp, UsersRound, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { applyRankedResult, createInitialRankState, parseLeagueRankState, rankedStorageKey } from "@/game/scoring";
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
const INFINITE_ROUNDS = 48;
const MIN_BUILD_WINRATE_GAMES = 5;
const POSITIVE_BUILD_ITEM_BOOST = 1200;
type ItemGuessResult = "correct" | "wrong";

export function ItemBuildGame({
  challenge,
  champions = [],
  items = [],
  username = "Guest"
}: {
  challenge: ItemBuildChallenge;
  champions?: PublicChampion[];
  items?: GameItem[];
  username?: string;
}) {
  const generatedRounds = useMemo(() => createBuildRounds(challenge, champions, items), [challenge, champions, items]);
  const rounds = useRandomizedRounds(generatedRounds, "item-build", username, undefined, buildRoundPriority);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedBoots, setSelectedBoots] = useState("");
  const [guesses, setGuesses] = useState<Array<{ items: string[]; boots: string }>>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("item-build", username);
  const round = rounds[roundIndex % rounds.length];
  const answerSet = useMemo(() => new Set(round.answerItemIds), [round.answerItemIds]);
  const solved = guesses.some((guess) => isBuildGuessSolved(guess, answerSet, round.answerBootsId));
  const finished = solved || guesses.length >= BUILD_MAX_GUESSES;
  const ready = selectedItems.length === 5 && Boolean(selectedBoots);
  const possibleItems = useMemo(() => uniqueItemsByName(round.possibleItems, new Set(round.answerItemIds)), [round.answerItemIds, round.possibleItems]);
  const possibleBoots = useMemo(() => uniqueItemsByName(round.possibleBoots, new Set([round.answerBootsId])), [round.answerBootsId, round.possibleBoots]);
  const randomizedPossibleItems = useMemo(() => seededShuffle(possibleItems, `${round.id}:possible-items`), [round.id, possibleItems]);
  const randomizedPossibleBoots = useMemo(() => seededShuffle(possibleBoots, `${round.id}:possible-boots`), [round.id, possibleBoots]);
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

  function reset() {
    setSelectedItems([]);
    setSelectedBoots("");
    setGuesses([]);
    setModalOpen(false);
  }

  function nextBuild() {
    setRoundIndex((current) => current + 1);
    setSelectedItems([]);
    setSelectedBoots("");
    setGuesses([]);
    setModalOpen(false);
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

  return (
    <section className="min-h-[calc(100dvh-5rem)] rounded-lg border border-[#3c3421] bg-[#071018] p-2 pb-16 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] sm:p-4 lg:rounded-sm">
      <div className="grid items-start gap-2 sm:gap-4 xl:grid-cols-[minmax(18rem,30%)_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="grid w-full gap-2 rounded-sm border border-[#3c3421] bg-[#0b111b] p-2.5 shadow-[0_24px_70px_rgba(0,0,0,.28)] sm:gap-3 sm:p-4">
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <span className="text-[#c89b3c]">
                <PackageSearch size={18} />
              </span>
              <h2 className="text-lg font-semibold sm:text-xl">Build</h2>
            </div>
            <div className="hidden sm:block">
              <InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />
            </div>
            <div className="rounded-sm border border-white/10 bg-[#050607]/75 p-2 sm:p-3">
              <ChampionLine label="Enemy Team" champions={round.enemyTeam} compact />
            </div>
            <div className="relative hidden aspect-[21/9] min-h-36 overflow-hidden rounded-sm border border-[#3c3421] bg-[#071018] sm:block sm:aspect-[16/10] sm:min-h-48 xl:aspect-[16/11] xl:min-h-56">
              <div
                className="absolute inset-0 bg-cover opacity-80"
                style={{
                  backgroundImage: `url(${round.champion.splashUrl})`,
                  backgroundPosition: championSplashPosition(round.champion.name)
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050607] via-[#050607]/20 to-transparent" />
            </div>
            <div className="grid gap-2">
              <div>
                <div className="text-[11px] uppercase text-[#c89b3c] sm:text-sm">Your Champion</div>
                <div className="font-display text-2xl font-bold sm:text-4xl">{round.champion.name}</div>
              </div>
              <BuildWinrateCard stats={round.winrateStats} />
            </div>
          </div>
        </aside>

        <div className="grid gap-3">
          <div className="grid gap-2 rounded-sm border border-[#3c3421] bg-[#0b111b] p-2 shadow-[inset_0_0_0_1px_rgba(200,155,60,.08)] sm:p-3">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-base font-extrabold tracking-tight text-white sm:text-xl">
                  Pick {round.champion.name}&apos;s best build against the enemy team.
                </div>
              </div>
              <div className="text-xs text-[color:var(--muted)]">Guess {Math.min(guesses.length + 1, BUILD_MAX_GUESSES)}/{BUILD_MAX_GUESSES}</div>
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

          <div className="grid items-start gap-2 xl:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="rounded-sm border border-white/10 bg-[#0b111b] p-2 sm:p-3">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-sm uppercase text-[#c89b3c]">Possible Items</span>
                <span className="text-xs text-[color:var(--muted)]">{possibleItems.length}</span>
              </div>
              <div className="grid grid-cols-3 content-start gap-1.5 px-0.5 pb-3 pt-1.5 sm:grid-cols-3 sm:gap-2 sm:px-1 sm:pb-4 sm:pt-2 md:grid-cols-4 2xl:grid-cols-6">
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
            <div className="rounded-sm border border-white/10 bg-[#0b111b] p-2 sm:p-3">
              <div className="mb-1.5 text-sm uppercase text-[#c89b3c]">Boots</div>
              <div className="grid grid-cols-2 content-start gap-1.5 px-0.5 pb-3 pt-1.5 sm:grid-cols-3 sm:gap-2 sm:px-1 sm:pb-4 sm:pt-2 xl:grid-cols-1">
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

          <div className="sticky bottom-2 z-20 grid gap-2 rounded-lg border border-white/10 bg-[#0b111b]/96 p-2 shadow-[0_18px_50px_rgba(0,0,0,.35)] backdrop-blur sm:grid-cols-[1fr_auto_auto] sm:items-center lg:static lg:rounded-sm lg:p-3 lg:shadow-none">
            <div className="text-xs text-[color:var(--muted)] sm:text-sm">
              {finished ? (solved ? `Solved in ${guesses.length}/${BUILD_MAX_GUESSES}.` : "No guesses left.") : `Selected: ${selectedItems.length}/5 items - ${selectedBoots ? "boots ready" : "choose boots"}`}
            </div>
            <Button type="button" variant="secondary" onClick={reset}>
              Reset
            </Button>
            <Button
              type="button"
              onClick={submitBuild}
              disabled={!ready || finished}
              className={cn(ready && !finished && "shadow-[0_0_20px_rgba(245,197,66,.18)]")}
            >
              Lock Guess
            </Button>
          </div>
        </div>
      </div>
      {modalOpen && (
        <BuildWordleModal
          round={round}
          guesses={guesses}
          solved={solved}
          onClose={() => setModalOpen(false)}
          onReset={reset}
          onNext={nextBuild}
        />
      )}
    </section>
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
  onClose,
  onReset,
  onNext
}: {
  round: ItemBuildChallenge;
  guesses: Array<{ items: string[]; boots: string }>;
  solved: boolean;
  onClose: () => void;
  onReset: () => void;
  onNext: () => void;
}) {
  useBodyScrollLock();

  const answerSet = new Set(round.answerItemIds);
  const targetItems = round.answerItemIds
    .map((id) => round.possibleItems.find((item) => item.id === id))
    .filter(Boolean) as GameItem[];
  const targetBoots = round.possibleBoots.find((item) => item.id === round.answerBootsId);
  const targetBuild = targetBoots ? [...targetItems, targetBoots] : targetItems;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto overscroll-contain bg-black/70 p-3 backdrop-blur-sm sm:p-4">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[#c89b3c]/60 bg-[#071018] p-4 shadow-[0_24px_90px_rgba(0,0,0,.65)] fine-scrollbar sm:max-h-[calc(100dvh-2rem)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-3xl font-extrabold text-[#f5c542]">{solved ? "Build diff." : "Shopkeeper wins."}</div>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {solved ? `Solved in ${guesses.length}/${BUILD_MAX_GUESSES} guesses.` : `The six-item answer dodged all ${BUILD_MAX_GUESSES} guesses.`}
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
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={onReset}>
            Replay
          </Button>
          <Button type="button" onClick={onNext}>
            Next build
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

function BuildWinrateCard({ stats }: { stats?: ItemBuildChallenge["winrateStats"] }) {
  if (!stats || stats.games < MIN_BUILD_WINRATE_GAMES) {
    return (
      <div className="rounded-sm border border-[#3c3421] bg-[#111722] p-2 sm:p-3">
        <div className="text-[11px] uppercase text-[color:var(--muted)]">Winrate</div>
        <div className="mt-1 font-display text-2xl font-bold text-[color:var(--muted)]">N/A</div>
      </div>
    );
  }

  const hasBuildSample = typeof stats.buildWinRate === "number" && (stats.buildGames ?? 0) >= MIN_BUILD_WINRATE_GAMES && stats.buildWinRate >= stats.winRate;
  const delta = hasBuildSample ? stats.buildWinRate! - stats.winRate : null;
  const buildDetail = hasBuildSample
    ? (stats.buildMatchedItemCount ?? 0) > 0
      ? `${stats.buildMatchedItemCount ?? 0}/${stats.targetItemIds?.length ?? 6} target items`
      : undefined
    : undefined;

  return (
    <div className="rounded-sm border border-[#3c3421] bg-[#111722] p-2 sm:p-3">
      <div className="grid grid-cols-2 gap-2">
        <WinrateMiniStat label="Baseline" winRate={stats.winRate} wins={stats.wins} games={stats.games} />
        <WinrateMiniStat
          label="Correct Build"
          winRate={hasBuildSample ? stats.buildWinRate : undefined}
          wins={stats.buildWins}
          games={stats.buildGames}
          detail={buildDetail}
        />
      </div>
      {delta !== null && (
        <div className={cn("mt-2 text-xs font-semibold", delta >= 0 ? "text-green-300" : "text-red-300")}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}% vs baseline
        </div>
      )}
    </div>
  );
}

function WinrateMiniStat({
  label,
  winRate,
  wins = 0,
  games = 0,
  detail
}: {
  label: string;
  winRate?: number;
  wins?: number;
  games?: number;
  detail?: string;
}) {
  const hasValue = typeof winRate === "number" && games >= MIN_BUILD_WINRATE_GAMES;

  return (
    <div className="rounded-sm border border-white/10 bg-[#050607]/70 p-2">
      <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--muted)]">{label}</div>
      <div className={cn("font-display text-xl font-bold sm:text-2xl", hasValue ? (winRate >= 50 ? "text-green-300" : "text-red-300") : "text-[color:var(--muted)]")}>
        {hasValue ? `${winRate.toFixed(1)}%` : "N/A"}
      </div>
      <div className="text-[11px] text-[color:var(--muted)]">{games > 0 ? `${wins}W / ${games}G` : `<${MIN_BUILD_WINRATE_GAMES} games`}</div>
      {detail && <div className="text-[10px] uppercase tracking-[0.06em] text-[#c89b3c]">{detail}</div>}
    </div>
  );
}

function withTargetBuildWinrateForUi(stats: ItemBuildChallenge["winrateStats"] | undefined, targetItemIds: string[]) {
  if (!stats) {
    return undefined;
  }

  const samples = stats.inventorySamples ?? [];
  const targetIds = uniqueStringsForUi(targetItemIds);
  let selected:
    | {
        games: typeof samples;
        wins: number;
        winRate: number;
        matchedItemCount: number;
      }
    | undefined;

  for (let size = targetIds.length; size >= 1; size -= 1) {
    let bestAtSize: typeof selected;

    for (const subset of combinationsForUi(targetIds, size)) {
      const games = samples.filter((game) => subset.every((itemId) => game.itemIds.includes(itemId)));

      if (games.length < MIN_BUILD_WINRATE_GAMES) {
        continue;
      }

      const wins = games.filter((game) => game.win).length;
      const winRate = Math.round((wins / games.length) * 1000) / 10;

      if (winRate < stats.winRate) {
        continue;
      }

      if (
        !bestAtSize ||
        winRate - stats.winRate > bestAtSize.winRate - stats.winRate ||
        (winRate === bestAtSize.winRate && games.length > bestAtSize.games.length)
      ) {
        bestAtSize = {
          games,
          wins,
          winRate,
          matchedItemCount: size
        };
      }
    }

    if (bestAtSize) {
      selected = bestAtSize;
      break;
    }
  }

  return {
    ...stats,
    targetItemIds,
    buildWins: selected?.wins ?? stats.wins,
    buildGames: selected?.games.length ?? (stats.games >= MIN_BUILD_WINRATE_GAMES ? stats.games : undefined),
    buildWinRate: selected?.winRate ?? (stats.games >= MIN_BUILD_WINRATE_GAMES ? stats.winRate : undefined),
    buildSampleMatches: selected ? new Set(selected.games.map((game) => game.matchId)).size : stats.games >= MIN_BUILD_WINRATE_GAMES ? stats.sampleMatches : undefined,
    buildMatchedItemCount: selected?.matchedItemCount ?? 0
  };
}

function createBuildRounds(base: ItemBuildChallenge, champions: PublicChampion[], itemCatalog: GameItem[]) {
  if (champions.length < 6 || itemCatalog.length < 20) {
    return [base];
  }

  const rounds: ItemBuildChallenge[] = [base];

  for (let index = 1; index <= INFINITE_ROUNDS; index += 1) {
    const previousChampionId = rounds[rounds.length - 1]?.champion.id;
    rounds.push(createGeneratedBuildRound(base, champions, itemCatalog, index, previousChampionId));
  }

  return rounds;
}

function buildRoundPriority(round: ItemBuildChallenge) {
  const stats = round.winrateStats;

  if (!stats?.buildGames || typeof stats.buildWinRate !== "number") {
    return 0;
  }

  const matchedItemBonus = stats.buildMatchedItemCount ?? 0;
  return 1000 + stats.buildGames * 10 + matchedItemBonus;
}

function createGeneratedBuildRound(base: ItemBuildChallenge, champions: PublicChampion[], itemCatalog: GameItem[], round: number, previousChampionId?: string): ItemBuildChallenge {
  const seed = `${base.date}:item-build-infinite:${round}`;
  const sampledChampions = champions
    .filter((champion) => hasVerifiedBuildChampionSampleForUi(base.winrateSamples?.[champion.id]))
    .sort((a, b) => (base.winrateSamples?.[b.id]?.games ?? 0) - (base.winrateSamples?.[a.id]?.games ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 20);
  const championPool = sampledChampions.length > 0 ? sampledChampions : champions;
  const champion = pickBuildChampion(championPool, `${seed}:champion`, previousChampionId);
  const enemyTeam = pickUiUnique(champions, `${seed}:enemy`, 5, [champion.id]);
  const sampleItemFrequency = buildItemFrequencyForUi(base.winrateSamples?.[champion.id]);
  const positiveItemSamples = buildPositiveItemSamplesForUi(base.winrateSamples?.[champion.id]);
  const candidateItems = itemCatalog
    .filter(isBuildCandidateItemForUi)
    .map((item) => ({ item, score: scoreBuildItemForVerifiedTags(item, champion, enemyTeam) + sampleItemScoreForUi(item.id, sampleItemFrequency, positiveItemSamples) }))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  const uniqueCandidateItems = uniqueScoredItemsByNameForUi(candidateItems);
  const bootCandidates = itemCatalog
    .filter((item) => isBuildBootUpgrade(item))
    .map((item) => ({ item, score: scoreBuildBootsForVerifiedTags(item, champion, enemyTeam) + sampleItemScoreForUi(item.id, sampleItemFrequency, positiveItemSamples) }))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  const uniqueBootCandidates = uniqueScoredItemsByNameForUi(bootCandidates);

  if (uniqueCandidateItems.length < 5 || uniqueBootCandidates.length === 0) {
    return base;
  }

  const answerBuild = uniqueCandidateItems.slice(0, 5).map((candidate) => candidate.item);
  const answerBoots = uniqueBootCandidates[0].item;
  const targetItemIds = [...answerBuild.map((item) => item.id), answerBoots.id];
  const possibleItems = uniqueCandidateItems.slice(0, 36).map((candidate) => candidate.item);
  const possibleBoots = uniqueBootCandidates.map((candidate) => candidate.item);

  return {
    ...base,
    id: `${base.date}:item-build:${round}`,
    champion,
    enemyTeam,
    candidates: uniqueCandidateItems.slice(0, 4).map((candidate) => candidate.item),
    possibleItems,
    possibleBoots,
    answerItemId: answerBuild[0].id,
    answerItemIds: answerBuild.map((item) => item.id),
    answerBootsId: answerBoots.id,
    winrateStats: withTargetBuildWinrateForUi(base.winrateSamples?.[champion.id], targetItemIds),
    winrateSamples: base.winrateSamples,
    matchupNotes: [
      `Target build: ${answerBuild.map((item) => item.name).join(", ")} plus ${answerBoots.name}.`,
      "Answer is generated from Riot Data Dragon item tags, champion tags, item costs, and purchasability flags."
    ],
    catalogModel: {
      ...base.catalogModel,
      candidateCount: possibleItems.length,
      targetItemCount: answerBuild.length
    }
  };
}

function pickBuildChampion(championPool: PublicChampion[], seed: string, previousChampionId?: string) {
  const start = hashString(seed) % championPool.length;

  for (let offset = 0; offset < championPool.length; offset += 1) {
    const champion = championPool[(start + offset) % championPool.length];

    if (champion.id !== previousChampionId || championPool.length === 1) {
      return champion;
    }
  }

  return championPool[start];
}

function buildItemFrequencyForUi(stats: ItemBuildChallenge["winrateStats"] | undefined) {
  const frequency = new Map<string, number>();

  for (const game of stats?.inventorySamples ?? []) {
    for (const itemId of game.itemIds) {
      frequency.set(itemId, (frequency.get(itemId) ?? 0) + 1);
    }
  }

  return frequency;
}

function hasVerifiedBuildChampionSampleForUi(stats: ItemBuildChallenge["winrateStats"] | undefined) {
  return Boolean(stats && stats.games >= MIN_BUILD_WINRATE_GAMES);
}

function buildPositiveItemSamplesForUi(stats: ItemBuildChallenge["winrateStats"] | undefined) {
  const samples = new Map<string, { wins: number; games: number; winRate: number; lift: number }>();

  if (!stats || stats.games < MIN_BUILD_WINRATE_GAMES) {
    return samples;
  }

  const raw = new Map<string, { wins: number; games: number }>();

  for (const game of stats.inventorySamples ?? []) {
    for (const itemId of uniqueStringsForUi(game.itemIds)) {
      const current = raw.get(itemId) ?? { wins: 0, games: 0 };
      current.games += 1;
      current.wins += game.win ? 1 : 0;
      raw.set(itemId, current);
    }
  }

  for (const [itemId, itemStats] of raw) {
    if (itemStats.games < MIN_BUILD_WINRATE_GAMES) {
      continue;
    }

    const winRate = Math.round((itemStats.wins / itemStats.games) * 1000) / 10;

    if (winRate >= stats.winRate) {
      samples.set(itemId, {
        ...itemStats,
        winRate,
        lift: winRate - stats.winRate
      });
    }
  }

  return samples;
}

function sampleItemScoreForUi(itemId: string, frequency: Map<string, number>, positiveSamples: Map<string, { games: number; lift: number }>) {
  const positive = positiveSamples.get(itemId);

  return (frequency.get(itemId) ?? 0) * 12 + (positive ? POSITIVE_BUILD_ITEM_BOOST + positive.games + positive.lift * 35 : 0);
}

function uniqueScoredItemsByNameForUi<T extends { item: GameItem }>(items: T[]) {
  const seen = new Set<string>();
  const uniqueEntries: T[] = [];

  for (const entry of items) {
    const key = itemNameKeyForUi(entry.item);

    if (!seen.has(key)) {
      seen.add(key);
      uniqueEntries.push(entry);
    }
  }

  return uniqueEntries;
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

function combinationsForUi(values: string[], size: number) {
  const result: string[][] = [];

  function visit(start: number, picked: string[]) {
    if (picked.length === size) {
      result.push(picked);
      return;
    }

    for (let index = start; index < values.length; index += 1) {
      visit(index + 1, [...picked, values[index]]);
    }
  }

  visit(0, []);
  return result;
}

function uniqueStringsForUi(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isBuildCandidateItemForUi(item: GameItem) {
  return item.purchasable && item.goldTotal >= 2200 && item.tags.length > 0 && !item.tags.includes("Consumable") && !item.tags.includes("Trinket") && !item.tags.includes("Boots");
}

function scoreBuildItemForVerifiedTags(item: GameItem, champion: PublicChampion, enemyTeam: PublicChampion[]) {
  const enemyTanks = enemyTeam.filter((enemy) => enemy.roles.includes("Tank")).length;
  const enemyAssassins = enemyTeam.filter((enemy) => enemy.roles.includes("Assassin")).length;
  const wantsAp = champion.roles.includes("Mage");
  const wantsAd = champion.roles.some((role) => ["Marksman", "Fighter", "Assassin"].includes(role));
  let score = item.goldTotal / 1000;

  if (wantsAp && item.tags.includes("SpellDamage")) score += 8;
  if (wantsAd && item.tags.includes("Damage")) score += 8;
  if (champion.roles.includes("Tank") && item.tags.some((tag) => ["Health", "Armor", "SpellBlock"].includes(tag))) score += 8;
  if (enemyTanks >= 2 && item.tags.some((tag) => ["ArmorPenetration", "MagicPenetration", "AttackSpeed"].includes(tag))) score += 5;
  if (enemyAssassins >= 2 && item.tags.some((tag) => ["Armor", "Health"].includes(tag))) score += 4;
  if (item.tags.includes("Boots")) score -= 8;

  return score;
}

function scoreBuildBootsForVerifiedTags(item: GameItem, champion: PublicChampion, enemyTeam: PublicChampion[]) {
  const enemyPhysical = enemyTeam.filter((enemy) => enemy.roles.some((role) => ["Marksman", "Fighter", "Assassin"].includes(role))).length;
  const enemyMagic = enemyTeam.filter((enemy) => enemy.roles.some((role) => ["Mage", "Support"].includes(role))).length;
  let score = item.goldTotal / 100;

  if (champion.roles.includes("Marksman") && item.tags.includes("AttackSpeed")) score += 20;
  if (champion.roles.includes("Mage") && item.tags.some((tag) => ["MagicPenetration", "CooldownReduction"].includes(tag))) score += 18;
  if (champion.roles.includes("Tank") && item.tags.includes("Armor")) score += 14;
  if (enemyPhysical >= 3 && item.tags.includes("Armor")) score += 12;
  if (enemyMagic >= 3 && item.tags.some((tag) => ["SpellBlock", "Tenacity"].includes(tag))) score += 12;

  return score;
}

function isBuildBootUpgrade(item: GameItem) {
  return item.purchasable && item.name !== "Boots" && item.tags.includes("Boots") && item.goldTotal >= 900;
}

export function ItemRecipeGame({ challenge, items: itemCatalog = [], username = "Guest" }: { challenge: ItemRecipeChallenge; items?: GameItem[]; username?: string }) {
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
  const randomizedComponents = useMemo(() => seededShuffle(componentChoices, `${round.id}:components`), [round.id, componentChoices]);

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

  return (
    <section className="min-h-[calc(100dvh-5rem)] rounded-lg border border-[#3c3421] bg-[#071018] p-2 pb-16 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] sm:p-4 lg:rounded-sm">
      <div className="grid items-start gap-2 sm:gap-4 xl:grid-cols-[minmax(18rem,30%)_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="grid w-full gap-2 rounded-sm border border-[#3c3421] bg-[#0b111b] p-2.5 shadow-[0_24px_70px_rgba(0,0,0,.28)] sm:gap-3 sm:p-4">
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <span className="text-[#c89b3c]">
                <Split size={18} />
              </span>
              <h2 className="text-lg font-semibold sm:text-xl">Recipe</h2>
            </div>
            <div className="hidden sm:block">
              <InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />
            </div>
            <div className="grid justify-items-center gap-2 rounded-sm border border-white/10 bg-[#050607]/75 p-2 sm:p-3">
              <ItemShopNode item={round.resultItem} size="large" />
            </div>
            <div className="grid gap-2 rounded-sm border border-[#3c3421] bg-[#111722] p-2 sm:gap-3 sm:p-3">
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

        <div className="grid gap-3 pb-10">
          <div className="rounded-sm border border-[#3c3421] bg-[#071018] p-2 sm:p-4">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="font-display text-base font-extrabold text-white sm:text-xl">Find the missing component.</div>
              </div>
              <div className="text-xs text-[color:var(--muted)]">{componentChoices.length}</div>
            </div>
            <div className="grid grid-cols-3 content-start gap-1.5 px-0.5 pb-4 pt-1.5 sm:grid-cols-3 sm:gap-2 sm:px-1 sm:pb-5 sm:pt-2 md:grid-cols-4 2xl:grid-cols-6">
              {randomizedComponents.map((item) => {
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
                      "relative grid min-h-20 content-center justify-items-center gap-1 rounded-sm border bg-[#111722] p-1.5 text-center transition duration-150 hover:z-10 hover:scale-[1.025] hover:border-[#c89b3c] hover:shadow-[0_0_18px_rgba(245,197,66,.16)] disabled:cursor-not-allowed sm:min-h-28 sm:gap-2 sm:p-2",
                      result === "correct" && "border-green-400/70 bg-green-500/18 shadow-[inset_0_0_0_1px_rgba(74,222,128,.22)]",
                      result === "wrong" && "border-[#394150] bg-[#151b26] grayscale",
                      !result && (answer === item.id ? "border-[#c89b3c] bg-[#c89b3c]/12 ring-2 ring-[#c89b3c]/35" : "border-[#26313f]"),
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
        "relative grid min-h-14 content-center justify-items-center gap-0.5 rounded-sm border bg-[#111722] p-1 text-center transition duration-150 hover:scale-[1.025] hover:border-[#c89b3c] hover:shadow-[0_0_18px_rgba(245,197,66,.16)] disabled:cursor-not-allowed sm:min-h-16 sm:gap-1 sm:p-1.5",
        result === "correct" && "border-green-400/70 bg-green-500/18 shadow-[inset_0_0_0_1px_rgba(74,222,128,.22)]",
        result === "wrong" && "border-[#394150] bg-[#151b26] grayscale",
        !result && (selected ? "border-[#c89b3c] bg-[#c89b3c]/14 shadow-[inset_0_0_0_1px_rgba(245,197,66,.25)]" : "border-[#26313f]"),
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
      <img src={item.imageUrl} alt="" className="h-7 w-7 object-contain sm:h-8 sm:w-8" />
      <span className="line-clamp-2 text-[9px] font-semibold leading-tight sm:text-[11px]">{item.name}</span>
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
        "relative grid grid-cols-[1.75rem_1fr] items-center gap-1.5 rounded-sm border bg-[#111722] p-1.5 text-left transition duration-150 hover:scale-[1.025] hover:border-[#c89b3c] hover:shadow-[0_0_18px_rgba(245,197,66,.16)] disabled:cursor-not-allowed sm:grid-cols-[2rem_1fr] sm:gap-2 sm:p-2",
        result === "correct" && "border-green-400/70 bg-green-500/18 shadow-[inset_0_0_0_1px_rgba(74,222,128,.22)]",
        result === "wrong" && "border-[#394150] bg-[#151b26] grayscale",
        !result && (selected ? "border-[#c89b3c] bg-[#c89b3c]/14 shadow-[inset_0_0_0_1px_rgba(245,197,66,.25)]" : "border-[#26313f]"),
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
      <img src={item.imageUrl} alt="" className="h-7 w-7 object-contain sm:h-8 sm:w-8" />
      <span className="truncate text-[11px] font-semibold sm:text-xs">{item.name}</span>
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
    <div className="flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
      <span className="inline-flex min-h-7 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 leading-none">
        Round <b className="relative top-px font-display leading-none text-[#f5c542]">{round}</b>
      </span>
      <span className="inline-flex min-h-7 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 leading-none">
        Streak <b className="relative top-px font-display leading-none text-white">{current}</b>
      </span>
      <span className="inline-flex min-h-7 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 leading-none">
        Best <b className="relative top-px font-display leading-none text-white">{best}</b>
      </span>
    </div>
  );
}

function useRandomizedRounds<T extends { id: string }>(
  rounds: T[],
  gameKey: string,
  username: string,
  avoidTripleKey?: (round: T) => string | undefined,
  priorityForRound?: (round: T) => number
) {
  const [loadSeed] = useState(() => `${Date.now()}:${Math.random()}`);
  const storageKey = `rift-daily:last-first-round:${gameKey}:${normalize(username || "guest")}`;
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
      randomized.sort((a, b) => priorityForRound(b) - priorityForRound(a));
    }

    const lastFirstRoundId = typeof window === "undefined" ? "" : window.localStorage.getItem(storageKey);

    if (avoidTripleKey) {
      return orderRoundsAvoidingTripleKey(randomized, avoidTripleKey, lastFirstRoundId ?? "");
    }

    if (lastFirstRoundId && randomized[0]?.id === lastFirstRoundId) {
      const currentPriority = priorityForRound ? priorityForRound(randomized[0]) : 0;
      const samePrioritySwapIndex = randomized.findIndex(
        (round) => round.id !== lastFirstRoundId && (!priorityForRound || priorityForRound(round) === currentPriority)
      );
      const swapIndex = samePrioritySwapIndex > 0 ? samePrioritySwapIndex : randomized.findIndex((round) => round.id !== lastFirstRoundId);

      if (swapIndex > 0) {
        [randomized[0], randomized[swapIndex]] = [randomized[swapIndex], randomized[0]];
      }
    }

    return randomized;
  }, [avoidTripleKey, loadSeed, priorityForRound, rounds, storageKey]);

  useEffect(() => {
    const firstRound = orderedRounds[0];

    if (firstRound) {
      window.localStorage.setItem(storageKey, firstRound.id);
    }
  }, [orderedRounds, storageKey]);

  return orderedRounds;
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

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { current: number; best: number; played: number; wins?: number };
        setStreak({ ...parsed, wins: parsed.wins ?? 0 });
      } catch {
        setStreak({ current: 0, best: 0, played: 0, wins: 0 });
      }
    } else {
      setStreak({ current: 0, best: 0, played: 0, wins: 0 });
    }
  }, [storageKey]);

  function record(correct: boolean, options: RankedRecordOptions = {}) {
    const performanceQuality = Math.max(0, Math.min(1, options.performanceQuality ?? (correct ? 0.75 : 0.25)));
    const roundId = options.roundId ?? `${gameKey}:${Date.now()}`;

    setStreak((current) => {
      const nextCurrent = correct ? current.current + 1 : 0;
      const next = {
        current: nextCurrent,
        best: Math.max(current.best, nextCurrent),
        played: current.played + 1,
        wins: current.wins + (correct ? 1 : 0)
      };
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      updateLocalRankState(username, correct, performanceQuality);
      window.dispatchEvent(new Event("rift-daily:streak-updated"));
      return next;
    });

    void persistRankedResult(gameKey, username, correct, performanceQuality, roundId, options.metadata);
  }

  return [streak, record] as const;
}

function updateLocalRankState(username: string, won: boolean, performanceQuality: number) {
  if (typeof window === "undefined") {
    return;
  }

  const key = rankedStorageKey(username);
  const current = parseLeagueRankState(window.localStorage.getItem(key)) ?? createInitialRankState();
  const next = applyRankedResult(current, { won, performanceQuality });
  window.localStorage.setItem(key, JSON.stringify(next));
}

async function persistRankedResult(
  gameKey: string,
  username: string,
  won: boolean,
  performanceQuality: number,
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

export function ChampionMatchupGame({ challenge, username = "Guest" }: { challenge: ChampionMatchupChallenge; username?: string }) {
  const generatedRounds = useMemo(() => createChampionMatchupRounds(challenge), [challenge]);
  const rounds = useRandomizedRounds(generatedRounds, "champion-matchup", username);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState<MatchupSide | "">("");
  const [submitted, setSubmitted] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("champion-matchup", username);
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
    setRoundIndex((current) => current + 1);
    setAnswer("");
    setSubmitted(false);
  }

  return (
    <PuzzleFrame icon={<Swords size={18} />} title="Champion Matchup">
      {round.unavailableReason ? (
        <VerifiedDataUnavailable reason={round.unavailableReason} />
      ) : (
        <div className="grid flex-1 gap-2 lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)_auto_auto] lg:gap-4">
          <InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />
          <div className="grid gap-2 rounded-sm border border-[#3c3421] bg-[#050607] p-2 sm:gap-3 sm:p-3 lg:min-h-[28rem] lg:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)]">
            <MatchupChampionCard side="left" pick={round.left} revealed={submitted} selected={answer === "left"} submitted={submitted} correctSide={round.answerSide === "left"} />
            <div className="grid place-items-center">
              <div className="grid h-14 w-14 place-items-center rounded-full border border-[#3c3421] bg-[#111722] font-display text-lg font-black text-[#c89b3c] shadow-[0_0_28px_rgba(200,155,60,.16)] lg:h-20 lg:w-20 lg:text-2xl">
                VS
              </div>
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
  const tone = submitted && correctSide ? "border-green-400/70 shadow-[0_0_36px_rgba(74,222,128,.18)]" : submitted && selected ? "border-red-400/70 shadow-[0_0_36px_rgba(248,113,113,.16)]" : "border-[#3c3421]";

  return (
    <article className={cn("relative min-h-0 overflow-hidden rounded-sm border bg-[#071018]", tone)}>
      <div className="absolute inset-0 bg-cover bg-center opacity-72" style={{ backgroundImage: `url(${pick.champion.splashUrl})` }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(200,155,60,.20),transparent_34%),linear-gradient(to_top,rgba(5,6,7,.98),rgba(5,6,7,.58)_45%,rgba(5,6,7,.18))]" />
      <div className="relative flex h-full min-h-[18rem] flex-col justify-between p-3 sm:min-h-[24rem] sm:p-4 lg:min-h-[28rem] lg:p-5">
        <div className={cn("flex items-center gap-2", side === "right" && "justify-end text-right")}>
          <span className="rounded-sm border border-[#c89b3c]/45 bg-[#050607]/82 px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.12em] text-[#f1d58a]">
            {pick.role}
          </span>
          <span className="rounded-sm border border-white/10 bg-[#050607]/70 px-3 py-1 text-xs text-[color:var(--muted)]">
            {pick.games} game{pick.games === 1 ? "" : "s"}
          </span>
        </div>
        <div className={cn("grid gap-4", side === "right" && "justify-items-end text-right")}>
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

export function GuessEloGame({ challenge, username = "Guest" }: { challenge: GuessEloChallenge; username?: string }) {
  const generatedRounds = useMemo(() => createEloRounds(challenge), [challenge]);
  const rounds = useRandomizedRounds(generatedRounds, "guess-elo", username, guessEloAnswerKey);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("guess-elo", username);
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
    setRoundIndex((current) => current + 1);
    setAnswer("");
    setSubmitted(false);
    setResultModalOpen(false);
  }

  return (
    <PuzzleFrame icon={<UsersRound size={18} />} title="Guess the Elo">
      {round.unavailableReason ? (
        <VerifiedDataUnavailable reason={round.unavailableReason} />
      ) : (
      <div className="grid flex-1 gap-2 lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)_auto_auto] lg:gap-4">
        <InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />
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
                "group relative isolate min-h-12 min-w-0 overflow-hidden rounded-sm border bg-[#111722] p-1 text-left transition hover:border-[#c89b3c] hover:shadow-[0_0_22px_rgba(200,155,60,.16)] disabled:cursor-default sm:min-h-16 sm:p-1.5",
                answer === option && option === round.answerTier && "border-green-400/70 bg-green-500/18 ring-1 ring-green-300/35",
                answer === option && option !== round.answerTier && "border-red-400/70 bg-red-500/16 ring-1 ring-red-300/30",
                answer !== option && submitted && option === round.answerTier && "border-green-400/70 bg-green-500/18",
                !submitted && answer !== option && "border-[#26313f]"
              )}
            >
              <RankSplitLabel option={option} compact />
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
          {submitted && (
            <NextLobbyButton onClick={nextRound} />
          )}
        </div>
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
  sourceMatch?: GuessEloRound["sourceMatch"] | DodgeQueueRound["sourceMatch"];
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
            <Button type="button" variant={expanded ? "secondary" : "primary"} onClick={() => setExpanded((current) => !current)}>
              {expanded ? "Hide match data" : "View match data"}
            </Button>
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

function MatchProofCard({ sourceMatch }: { sourceMatch?: GuessEloRound["sourceMatch"] | DodgeQueueRound["sourceMatch"] }) {
  const [copied, setCopied] = useState(false);

  if (!sourceMatch) {
    return null;
  }

  const match = sourceMatch;

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
      {match.matchData ? (
        <VerifiedMatchReport match={match.matchData} />
      ) : (
        <div className="mt-3 rounded-lg border border-[#2b2f38] bg-[#111722] p-2 text-xs text-[color:var(--muted)]">
          Match details unavailable in this payload, but the exact Riot Match-V5 ID is shown above.
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

function EloTeamRow({ side, lanes }: { side: string; lanes: EloRound["lanes"] }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:min-h-0 sm:grid-cols-[4.5rem_repeat(5,minmax(0,1fr))] sm:gap-2">
      <div className="font-display col-span-2 grid min-h-8 place-items-center rounded-sm border border-[#26313f] bg-[#0b111b] text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#c89b3c] sm:col-span-1 sm:min-h-0 sm:text-xs">
        {side}
      </div>
      {lanes.map((lane) => (
        <div key={`${side}:${lane.role}`} className="relative min-h-24 overflow-hidden rounded-sm border border-[#3c3421] bg-[#111722] sm:min-h-0">
          <div className="absolute inset-0 bg-cover bg-center opacity-48" style={{ backgroundImage: `url(${lane.champion.splashUrl})` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050607] via-[#050607]/55 to-transparent" />
          <div className="relative flex h-full min-h-0 flex-col justify-end p-2 sm:p-2">
            <span className="text-[10px] uppercase leading-tight text-[#c89b3c]">{lane.role}</span>
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

export function DodgeQueueGame({ challenge, username = "Guest" }: { challenge: DodgeQueueChallenge; username?: string }) {
  const generatedRounds = useMemo(() => createDodgeQueueRounds(challenge), [challenge]);
  const rounds = useRandomizedRounds(generatedRounds, "dodge-queue", username);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("dodge-queue", username);
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
    setRoundIndex((current) => current + 1);
    setAnswer("");
    setSubmitted(false);
    setResultModalOpen(false);
  }

  return (
    <PuzzleFrame icon={<CircleSlash size={18} />} title="Dodge or Queue">
      {round.unavailableReason ? (
        <VerifiedDataUnavailable reason={round.unavailableReason} />
      ) : (
      <div className="grid flex-1 gap-2 lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)_auto_auto] lg:gap-4">
        <InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />
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
              "font-display min-h-11 rounded-sm border px-3 text-base font-extrabold transition disabled:cursor-default sm:min-h-14 sm:px-4 sm:text-lg",
              answer === "dodge"
                ? "border-red-300 bg-red-500 text-white"
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
              "font-display min-h-11 rounded-sm border px-3 text-base font-extrabold transition disabled:cursor-default sm:min-h-14 sm:px-4 sm:text-lg",
              answer === "queue"
                ? "border-green-300 bg-green-500 text-[#071018]"
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
          {submitted && (
            <NextLobbyButton onClick={nextLobby} />
          )}
        </div>
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

function pickUiUnique(list: PublicChampion[], seed: string, count: number, excluded: string[]) {
  const excludedSet = new Set(excluded);
  const sorted = [...list].sort((a, b) => (hashString(`${seed}:${a.id}`) % 1000) - (hashString(`${seed}:${b.id}`) % 1000));
  const picked: PublicChampion[] = [];

  for (const item of sorted) {
    if (!excludedSet.has(item.id)) {
      picked.push(item);
      excludedSet.add(item.id);
    }

    if (picked.length === count) {
      break;
    }
  }

  return picked;
}

function PuzzleFrame({ icon, title, kicker, children }: { icon: ReactNode; title: string; kicker?: string; children: ReactNode }) {
  return (
    <section className="flex h-auto min-h-[calc(100dvh-5rem)] flex-col gap-2 rounded-lg border border-[#3c3421] bg-[#071018] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] sm:gap-3 sm:p-4 lg:h-full lg:min-h-0 lg:rounded-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[#c89b3c]">{icon}</span>
        <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
        {kicker && <span className="text-xs text-[color:var(--muted)] sm:text-sm">{kicker}</span>}
      </div>
      {children}
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

function ChampionLine({ label, champions, compact }: { label: string; champions: Array<{ id: string; name: string; squareUrl: string; roles: string[] }>; compact?: boolean }) {
  return (
    <div className="grid gap-1.5 sm:gap-2">
      <div className="text-[11px] uppercase text-[#c89b3c] sm:text-sm">{label}</div>
      <div className={cn("grid gap-1.5 sm:gap-2", compact ? "grid-cols-5" : "grid-cols-5")}>
        {champions.map((champion) => (
          <div key={champion.id} className={cn("overflow-hidden rounded-sm border border-white/10 bg-[#111722]", compact && "bg-[#050607]/75")} title={champion.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={champion.squareUrl} alt="" className={cn("aspect-square w-full object-cover", compact ? "h-9 sm:h-12" : "h-14 sm:h-16")} />
            <div className={cn("p-2", compact && "hidden xl:block px-1.5 py-1")}>
              <div className="truncate text-sm font-semibold leading-tight">{champion.name}</div>
            </div>
          </div>
        ))}
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
    <div className="grid gap-2 rounded-sm border border-[#3c3421] bg-[#050607] p-2 sm:p-3 md:min-h-0 md:grid-cols-[1fr_4rem_1fr] xl:grid-cols-[1fr_5rem_1fr]">
      <DraftTeam side="blue" name={blueName} picks={bluePicks} bans={blueBans} hiddenLabel={hiddenLabel} />
      <div className="grid place-items-center text-center">
        <div className="rounded-full border border-[#3c3421] px-3 py-1.5 text-sm font-bold text-[#c89b3c] md:px-4 md:py-3 md:text-xl">VS</div>
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
      <div className={cn("flex items-center gap-2", side === "red" ? "justify-end" : "justify-start")}>
        {side === "red" && <BanCluster bans={bans} />}
        <div className={cn("truncate text-base font-bold text-[#c89b3c] sm:text-lg", side === "red" && "text-right")}>{name}</div>
        {side === "blue" && <BanCluster bans={bans} />}
      </div>
      <div className="grid gap-1.5 md:min-h-0 md:grid-rows-5 md:gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <DraftPickCard key={index} pick={picks[index]} hiddenLabel={hiddenLabel} />
        ))}
      </div>
    </div>
  );
}

function BanCluster({ bans }: { bans: Array<OptionItem | undefined> }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <BanIcon key={index} pick={bans[index]} />
      ))}
    </div>
  );
}

function DraftPickCard({ pick, hiddenLabel }: { pick?: OptionItem; hiddenLabel: string }) {
  return (
    <div className="grid min-h-14 grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-sm border border-[#3c3421] bg-[#111722] p-1.5 sm:min-h-16 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:p-2 md:min-h-20 md:grid-cols-[4.25rem_minmax(0,1fr)] md:gap-3">
      <div className="relative h-12 w-12 overflow-hidden rounded-sm border border-[#3c3421] bg-[#071018] sm:h-14 sm:w-14 md:h-16 md:w-16">
        {pick?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pick.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-[#c89b3c]">?</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold leading-tight sm:text-base md:text-lg">{pick?.label ?? hiddenLabel}</div>
        <div className="truncate text-[11px] leading-tight text-[#c89b3c] sm:text-xs md:text-sm">{pick?.sublabel ?? "Champion select"}</div>
        {pick?.playerName && (
          <div title={pick.playerName} className="mt-0.5 truncate text-[11px] font-semibold tracking-[0.02em] text-[#9fb7d5]">
            {pick.playerName}
          </div>
        )}
        {pick?.spells && (
          <div className="mt-1 flex gap-1">
            {pick.spells.map((spell) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={spell.id} src={spell.iconUrl} alt={spell.name} title={spell.name} className="h-5 w-5 rounded-sm border border-[#3c3421] sm:h-6 sm:w-6" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
    spells,
    ...(playerName ? { playerName } : {})
  };
}

const laneLabels = ["Top", "Jungle", "Mid", "Bot", "Supp"] as const;
type LaneLabel = (typeof laneLabels)[number];

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

function RankSplitLabel({ option, compact = false }: { option: string; compact?: boolean }) {
  const ranks = rankOptionParts(option);

  if (ranks.length === 0) {
    return (
      <div className={cn("grid place-items-center rounded-lg border border-[#c89b3c]/28 bg-[#c89b3c]/10 px-2 text-center sm:rounded-xl sm:px-3", compact ? "min-h-11 sm:min-h-[3.25rem]" : "min-h-16 sm:min-h-20")}>
        <span className={cn("font-display font-black uppercase tracking-[0.06em] text-[#f5c542] sm:tracking-[0.08em]", compact ? "text-xs sm:text-sm" : "text-lg sm:text-2xl")}>{option}</span>
      </div>
    );
  }

  return (
    <div className={cn("relative grid overflow-hidden rounded-lg border border-white/10 bg-[#071018] shadow-[inset_0_1px_0_rgba(255,255,255,.04)] sm:rounded-xl", ranks.length > 1 && "grid-cols-2", compact ? "min-h-11 sm:min-h-[3.25rem]" : "min-h-16 sm:min-h-20")}>
      {ranks.map((rank) => {
        const visual = rankVisuals[rank];

        return (
          <div key={rank} className="relative grid place-items-center px-1.5 py-1.5 text-center sm:px-2 sm:py-2" style={{ background: visual.background, borderColor: visual.border }}>
            <span className={cn("font-display font-black uppercase leading-none tracking-[0.04em] sm:tracking-[0.08em]", compact ? "text-xs sm:text-[15px]" : "text-base sm:text-2xl")} style={{ color: visual.color }}>
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
