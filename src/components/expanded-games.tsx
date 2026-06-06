"use client";

import { CheckCircle2, CircleSlash, PackageSearch, Split, UsersRound, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  DodgeQueueChallenge,
  GameItem,
  GuessEloChallenge,
  ItemBuildChallenge,
  ItemRecipeChallenge,
  OptionItem,
  PublicChampion
} from "@/types";

const BUILD_MAX_GUESSES = 6;
const INFINITE_ROUNDS = 48;
type ItemGuessResult = "correct" | "wrong";

export function ItemBuildGame({ challenge }: { challenge: ItemBuildChallenge }) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedBoots, setSelectedBoots] = useState("");
  const [guesses, setGuesses] = useState<Array<{ items: string[]; boots: string }>>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const answerSet = useMemo(() => new Set(challenge.answerItemIds), [challenge.answerItemIds]);
  const solved = guesses.some((guess) => isBuildGuessSolved(guess, answerSet, challenge.answerBootsId));
  const finished = solved || guesses.length >= BUILD_MAX_GUESSES;
  const ready = selectedItems.length === 5 && Boolean(selectedBoots);
  const baselineDelta = challenge.winrateModel.projected - challenge.winrateModel.baseline;
  const randomizedPossibleItems = useMemo(() => seededShuffle(challenge.possibleItems, `${challenge.id}:possible-items`), [challenge.id, challenge.possibleItems]);
  const randomizedPossibleBoots = useMemo(() => seededShuffle(challenge.possibleBoots, `${challenge.id}:possible-boots`), [challenge.id, challenge.possibleBoots]);
  const lockedBuildResults = useMemo(() => {
    const results = new Map<string, ItemGuessResult>();

    for (const guess of guesses) {
      for (const itemId of guess.items) {
        results.set(itemId, answerSet.has(itemId) ? "correct" : "wrong");
      }

      results.set(guess.boots, guess.boots === challenge.answerBootsId ? "correct" : "wrong");
    }

    return results;
  }, [answerSet, challenge.answerBootsId, guesses]);

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
    const nextSolved = isBuildGuessSolved(guess, answerSet, challenge.answerBootsId);

    setGuesses(nextGuesses);
    setSelectedItems([]);
    setSelectedBoots("");

    if (nextSolved || nextGuesses.length >= BUILD_MAX_GUESSES) {
      setModalOpen(true);
    }
  }

  return (
    <section className="min-h-[calc(100vh-6.5rem)] rounded-sm border border-[#3c3421] bg-[#071018] p-4 pb-16 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(19rem,32%)_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="grid w-full gap-3 rounded-sm border border-[#3c3421] bg-[#0b111b] p-4 shadow-[0_24px_70px_rgba(0,0,0,.28)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[#c89b3c]">
                <PackageSearch size={18} />
              </span>
              <h2 className="text-xl font-semibold">Item Build Puzzle</h2>
            </div>
            <div className="rounded-sm border border-white/10 bg-[#050607]/75 p-3">
              <ChampionLine label="Enemy Team" champions={challenge.enemyTeam} compact />
            </div>
            <div className="relative aspect-[16/11] min-h-64 overflow-hidden rounded-sm border border-[#3c3421] bg-[#071018]">
              <div
                className="absolute inset-0 bg-cover opacity-80"
                style={{
                  backgroundImage: `url(${challenge.champion.splashUrl})`,
                  backgroundPosition: championSplashPosition(challenge.champion.name)
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050607] via-[#050607]/20 to-transparent" />
            </div>
            <div className="grid gap-3">
              <div>
                <div className="text-sm uppercase text-[#c89b3c]">Your Champion</div>
                <div className="font-display text-4xl font-bold">{challenge.champion.name}</div>
                <div className="text-sm text-[color:var(--muted)]">{challenge.champion.roles.join(" / ")}</div>
              </div>
              <div className="rounded-sm border border-[#3c3421] bg-[#111722] p-3">
                <div className="text-xs uppercase text-[color:var(--muted)]">Winrate Model</div>
                <div className="mt-1 flex items-end gap-2">
                  <span className="font-display text-3xl font-bold text-[#c89b3c]">{challenge.winrateModel.projected.toFixed(1)}%</span>
                  <span className={cn("pb-1 text-sm font-bold", baselineDelta >= 0 ? "text-green-300" : "text-red-300")}>
                    {baselineDelta >= 0 ? "+" : ""}{baselineDelta.toFixed(1)}% vs baseline
                  </span>
                </div>
                <div className="text-xs text-[color:var(--muted)]">Baseline {challenge.winrateModel.baseline}%</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="grid gap-4">
          <div className="rounded-sm border border-[#3c3421] bg-[#0b111b] p-4">
            <h3 className="font-display text-2xl font-extrabold tracking-tight">
              Build {challenge.champion.name}&apos;s best 5-item setup into this enemy team.
            </h3>
            <p className="mt-1 text-sm text-[color:var(--muted)]">Six tries. Five completed items and one pair of boots. Order does not matter.</p>
          </div>
          <div className="grid gap-2 rounded-sm border border-[#3c3421] bg-[#0b111b] p-3 shadow-[inset_0_0_0_1px_rgba(200,155,60,.08)]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm uppercase text-[#c89b3c]">Build Board</div>
                <div className="text-xs text-[color:var(--muted)]">Green slots are in the target build. Grey slots are not.</div>
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
                  answerBootsId={challenge.answerBootsId}
                  onRemoveItem={removeItem}
                  onRemoveBoots={removeBoots}
                />
              );
            })}
          </div>

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="rounded-sm border border-white/10 bg-[#0b111b] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm uppercase text-[#c89b3c]">Possible Items</span>
                <span className="text-xs text-[color:var(--muted)]">{challenge.possibleItems.length} role-matched options</span>
              </div>
              <div className="grid content-start gap-2 px-1 pb-4 pt-2 sm:grid-cols-4 2xl:grid-cols-6">
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
            <div className="rounded-sm border border-white/10 bg-[#0b111b] p-3">
              <div className="mb-2 text-sm uppercase text-[#c89b3c]">Boots</div>
              <div className="grid content-start gap-2 px-1 pb-4 pt-2">
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

          <div className="grid gap-2 rounded-sm border border-white/10 bg-[#0b111b] p-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div className="text-sm text-[color:var(--muted)]">
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
          challenge={challenge}
          guesses={guesses}
          solved={solved}
          onClose={() => setModalOpen(false)}
          onReset={reset}
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
    <div className="grid grid-cols-6 gap-2">
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
  challenge,
  guesses,
  solved,
  onClose,
  onReset
}: {
  challenge: ItemBuildChallenge;
  guesses: Array<{ items: string[]; boots: string }>;
  solved: boolean;
  onClose: () => void;
  onReset: () => void;
}) {
  const answerSet = new Set(challenge.answerItemIds);
  const targetItems = challenge.answerItemIds
    .map((id) => challenge.possibleItems.find((item) => item.id === id))
    .filter(Boolean) as GameItem[];
  const targetBoots = challenge.possibleBoots.find((item) => item.id === challenge.answerBootsId);
  const targetBuild = targetBoots ? [...targetItems, targetBoots] : targetItems;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-md border border-[#c89b3c]/60 bg-[#071018] p-5 shadow-[0_24px_90px_rgba(0,0,0,.65)]">
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
            className="grid h-9 w-9 place-items-center rounded-sm border border-white/10 bg-white/5 text-[color:var(--muted)] transition hover:border-[#c89b3c] hover:text-white"
            aria-label="Close result"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-5 grid gap-1.5">
          {guesses.map((guess, rowIndex) => (
            <div key={`${guess.boots}:${rowIndex}`} className="grid grid-cols-6 gap-1.5">
              {[...guess.items.map((id) => answerSet.has(id)), guess.boots === challenge.answerBootsId].map((correct, index) => (
                <div key={index} className={cn("h-8 rounded-sm border", correct ? "border-green-300/60 bg-green-500/70" : "border-white/10 bg-[#2b313d]")} />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-5">
          <div className="text-xs uppercase text-[#c89b3c]">Target Build</div>
          <div className="mt-2 grid grid-cols-6 gap-2">
            {targetBuild.map((item) => (
              <div key={item.id} className="grid min-h-16 place-items-center rounded-sm border border-green-400/45 bg-green-500/12 p-1 text-center">
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
        </div>
      </div>
    </div>
  );
}

function isBuildGuessSolved(guess: { items: string[]; boots: string }, answerSet: Set<string>, answerBootsId: string) {
  return guess.items.length === 5 && guess.items.every((id) => answerSet.has(id)) && guess.boots === answerBootsId;
}

export function ItemRecipeGame({ challenge, items: itemCatalog = [], username = "Guest" }: { challenge: ItemRecipeChallenge; items?: GameItem[]; username?: string }) {
  const rounds = useMemo(() => createRecipeRounds(challenge, itemCatalog), [challenge, itemCatalog]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("item-recipe", username);
  const round = rounds[roundIndex % rounds.length];
  const correct = submitted && answer === round.missingComponentId;
  const selected = round.allComponents.find((item) => item.id === answer);
  const randomizedComponents = useMemo(() => seededShuffle(round.allComponents, `${round.id}:components`), [round.id, round.allComponents]);

  function submitRecipe() {
    if (!answer || submitted) {
      return;
    }

    const solved = answer === round.missingComponentId;
    setSubmitted(true);
    recordStreak(solved);
  }

  function nextRecipe() {
    setRoundIndex((current) => current + 1);
    setAnswer("");
    setSubmitted(false);
  }

  return (
    <section className="min-h-[calc(100vh-6.5rem)] rounded-sm border border-[#3c3421] bg-[#071018] p-4 pb-16 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(19rem,32%)_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="grid w-full gap-3 rounded-sm border border-[#3c3421] bg-[#0b111b] p-4 shadow-[0_24px_70px_rgba(0,0,0,.28)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[#c89b3c]">
                <Split size={18} />
              </span>
              <h2 className="text-xl font-semibold">Item Recipe Puzzle</h2>
            </div>
            <InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />
            <div className="grid justify-items-center gap-2 rounded-sm border border-white/10 bg-[#050607]/75 p-3">
              <div className="text-sm uppercase text-[#c89b3c]">Result Item</div>
              <ItemShopNode item={round.resultItem} size="large" />
            </div>
            <div className="grid gap-3 rounded-sm border border-[#3c3421] bg-[#111722] p-3">
              <div className="text-xs uppercase text-[color:var(--muted)]">Shop Recipe</div>
              <div className="mx-auto h-8 w-px bg-[#3c3421]" />
              <div className="grid grid-cols-3 items-start gap-3">
                {round.knownComponents.map((item) => (
                  <ItemShopNode key={item.id} item={item} />
                ))}
                <MissingRecipeNode item={selected} submitted={submitted} correct={correct} />
              </div>
            </div>
            <div className="grid gap-2">
              <div className="text-sm text-[color:var(--muted)]">
                {submitted ? (correct ? "Correct component." : `Correct answer: ${getItemName(round.allComponents, round.missingComponentId)}`) : "Choose the missing component from the shop grid."}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={!answer || submitted} onClick={() => { setAnswer(""); setSubmitted(false); }}>
                  Clear
                </Button>
                <Button type="button" onClick={submitRecipe} disabled={!answer || submitted}>
                  Lock Component
                </Button>
                {submitted && (
                  <Button type="button" variant="secondary" onClick={nextRecipe}>
                    Next recipe
                  </Button>
                )}
                <ResultPill submitted={submitted} correct={correct} answer={getItemName(round.allComponents, round.missingComponentId)} />
              </div>
            </div>
          </div>
        </aside>

        <div className="grid gap-4 pb-10">
          <div className="rounded-sm border border-[#3c3421] bg-[#0b111b] p-4">
            <h3 className="font-display text-2xl font-extrabold tracking-tight">Find the missing recipe component.</h3>
            <p className="mt-1 text-sm text-[color:var(--muted)]">Only direct item components are shown. Pick the ingredient that completes the shop recipe.</p>
          </div>
          <div className="rounded-sm border border-[#3c3421] bg-[#071018] p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm uppercase text-[#c89b3c]">Component Shop</div>
                <div className="text-xs text-[color:var(--muted)]">Components that build into other purchasable League items.</div>
              </div>
              <div className="text-xs text-[color:var(--muted)]">{round.allComponents.length} components</div>
            </div>
            <div className="grid content-start gap-3 px-2 pb-5 pt-2 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-6">
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
                      "relative grid min-h-28 content-center justify-items-center gap-2 rounded-sm border bg-[#111722] p-2 text-center transition duration-150 hover:z-10 hover:scale-[1.025] hover:border-[#c89b3c] hover:shadow-[0_0_18px_rgba(245,197,66,.16)] disabled:cursor-not-allowed",
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
                    <img src={item.imageUrl} alt="" className="h-14 w-14 object-contain" />
                    <span className="line-clamp-2 text-center text-xs font-semibold leading-tight">{item.name}</span>
                    <span className={cn("text-[11px]", result === "wrong" ? "text-[#9ca3af]" : "text-[#c89b3c]")}>{item.goldTotal}g</span>
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
        "group relative grid min-h-20 place-items-center rounded-sm border bg-[#111722] p-2 text-center transition disabled:cursor-default",
        item && !submitted && "border-[#c89b3c] bg-[#c89b3c]/10 shadow-[inset_0_0_0_1px_rgba(245,197,66,.18)]",
        !item && "border-dashed border-[#394150]",
        submitted && (correct ? "border-green-400/70 bg-green-500/18" : "border-[#394150] bg-[#151b26] grayscale")
      )}
    >
      {item ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt="" className="h-9 w-9 object-contain" />
          <span className="line-clamp-2 text-[10px] font-semibold leading-tight">{item.name}</span>
          {!submitted && (
            <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[#c89b3c]/40 bg-[#050607]/90 text-[#f5c542] opacity-0 transition group-hover:opacity-100">
              <X size={12} />
            </span>
          )}
        </>
      ) : (
        <span className="text-xs uppercase text-[color:var(--muted)]">{label}</span>
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
        "relative grid min-h-16 content-center justify-items-center gap-1 rounded-sm border bg-[#111722] p-1.5 text-center transition duration-150 hover:scale-[1.025] hover:border-[#c89b3c] hover:shadow-[0_0_18px_rgba(245,197,66,.16)] disabled:cursor-not-allowed",
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
      <img src={item.imageUrl} alt="" className="h-8 w-8 object-contain" />
      <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{item.name}</span>
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
        "relative grid grid-cols-[2rem_1fr] items-center gap-2 rounded-sm border bg-[#111722] p-2 text-left transition duration-150 hover:scale-[1.025] hover:border-[#c89b3c] hover:shadow-[0_0_18px_rgba(245,197,66,.16)] disabled:cursor-not-allowed",
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
      <img src={item.imageUrl} alt="" className="h-8 w-8 object-contain" />
      <span className="truncate text-xs font-semibold">{item.name}</span>
    </button>
  );
}

function ItemShopNode({ item, size = "normal" }: { item: GameItem; size?: "normal" | "large" }) {
  return (
    <div className={cn("grid justify-items-center gap-1 rounded-sm border border-[#3c3421] bg-[#111722] p-2 text-center", size === "large" && "min-w-36 p-3")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt="" className={cn("object-contain", size === "large" ? "h-16 w-16" : "h-12 w-12")} />
      <span className="line-clamp-2 text-xs font-semibold leading-tight">{item.name}</span>
      <span className="text-[10px] text-[#c89b3c]">{item.goldTotal}g</span>
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
    <div className="grid grid-cols-3 gap-2 rounded-sm border border-[#26313f] bg-[#111722] p-2 text-center text-xs">
      <div>
        <div className="font-display text-lg font-bold text-[#f5c542]">{round}</div>
        <div className="uppercase text-[color:var(--muted)]">Round</div>
      </div>
      <div>
        <div className="font-display text-lg font-bold">{current}</div>
        <div className="uppercase text-[color:var(--muted)]">Streak</div>
      </div>
      <div>
        <div className="font-display text-lg font-bold">{best}</div>
        <div className="uppercase text-[color:var(--muted)]">Best</div>
      </div>
    </div>
  );
}

function usePersonalModeStreak(gameKey: string, username: string) {
  const storageKey = `rift-daily:${gameKey}:${normalize(username || "guest")}`;
  const [streak, setStreak] = useState({ current: 0, best: 0, played: 0 });

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);

    if (raw) {
      try {
        setStreak(JSON.parse(raw) as { current: number; best: number; played: number });
      } catch {
        setStreak({ current: 0, best: 0, played: 0 });
      }
    } else {
      setStreak({ current: 0, best: 0, played: 0 });
    }
  }, [storageKey]);

  function record(correct: boolean) {
    setStreak((current) => {
      const nextCurrent = correct ? current.current + 1 : 0;
      const next = {
        current: nextCurrent,
        best: Math.max(current.best, nextCurrent),
        played: current.played + 1
      };
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  return [streak, record] as const;
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

type EloRound = Pick<GuessEloChallenge, "id" | "date" | "lanes" | "enemyLanes" | "options" | "answerTier" | "signalNotes" | "dataSource">;

export function GuessEloGame({ challenge, champions, username = "Guest" }: { challenge: GuessEloChallenge; champions: PublicChampion[]; username?: string }) {
  const rounds = useMemo(() => createEloRounds(challenge, champions), [challenge, champions]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("guess-elo", username);
  const round = rounds[roundIndex % rounds.length];
  const correct = submitted && answer === round.answerTier;

  function choose(option: string) {
    if (submitted) {
      return;
    }

    setAnswer(option);
    setSubmitted(true);

    recordStreak(option === round.answerTier);
  }

  function nextRound() {
    setRoundIndex((current) => current + 1);
    setAnswer("");
    setSubmitted(false);
  }

  return (
    <PuzzleFrame icon={<UsersRound size={18} />} title="Guess the Elo">
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-4">
        <InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />
        <div className="grid min-h-0 grid-rows-2 gap-2 rounded-sm border border-[#3c3421] bg-[#071018] p-3">
          <EloTeamRow side="Blue Team" lanes={round.lanes} />
          <EloTeamRow side="Red Team" lanes={round.enemyLanes} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {round.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              disabled={submitted}
              className={cn(
                "grid min-h-16 grid-cols-[3rem_1fr] items-center gap-2 rounded-sm border bg-[#111722] p-2 text-left transition hover:border-[#c89b3c] disabled:cursor-default",
                answer === option && option === round.answerTier && "border-green-400/70 bg-green-500/18 ring-1 ring-green-300/35",
                answer === option && option !== round.answerTier && "border-red-400/70 bg-red-500/16 ring-1 ring-red-300/30",
                answer !== option && submitted && option === round.answerTier && "border-green-400/70 bg-green-500/18",
                !submitted && answer !== option && "border-[#26313f]"
              )}
            >
              <span className="flex -space-x-4">
                {rankIcons(option).map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="" className="h-10 w-10 object-contain drop-shadow" />
                ))}
              </span>
              <span className="font-semibold">{option}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <ResultPill submitted={submitted} correct={correct} answer={round.answerTier} />
          {submitted && (
            <Button type="button" onClick={nextRound}>
              Next lobby
            </Button>
          )}
        </div>
        {submitted && (
          <div className="grid grid-cols-3 gap-2 text-sm">
            {round.signalNotes.map((note) => (
              <div key={note} className="rounded-sm border border-[#2b2f38] bg-[#111722] p-2">
                {note}
              </div>
            ))}
          </div>
        )}
      </div>
    </PuzzleFrame>
  );
}

function EloTeamRow({ side, lanes }: { side: string; lanes: EloRound["lanes"] }) {
  return (
    <div className="grid min-h-0 grid-cols-[4.5rem_repeat(5,minmax(0,1fr))] gap-2">
      <div className="font-display grid place-items-center rounded-sm border border-[#26313f] bg-[#0b111b] text-center text-xs font-bold uppercase tracking-[0.08em] text-[#c89b3c]">
        {side}
      </div>
      {lanes.map((lane) => (
        <div key={`${side}:${lane.role}`} className="relative min-h-0 overflow-hidden rounded-sm border border-[#3c3421] bg-[#111722]">
          <div className="absolute inset-0 bg-cover bg-center opacity-48" style={{ backgroundImage: `url(${lane.champion.splashUrl})` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050607] via-[#050607]/55 to-transparent" />
          <div className="relative flex h-full min-h-0 flex-col justify-end p-2">
            <span className="text-[10px] uppercase leading-tight text-[#c89b3c]">{lane.role}</span>
            <span className="truncate text-base font-bold leading-tight">{lane.champion.name}</span>
            <div className="mt-1 flex gap-1">
              {lane.spells.map((spell) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={spell} src={summonerSpellIcon(spell)} alt={spell} title={spell} className="h-7 w-7 rounded-sm border border-[#3c3421]" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DodgeQueueGame({ challenge, champions = [], username = "Guest" }: { challenge: DodgeQueueChallenge; champions?: PublicChampion[]; username?: string }) {
  const rounds = useMemo(() => createDodgeQueueRounds(challenge, champions), [challenge, champions]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [streak, recordStreak] = usePersonalModeStreak("dodge-queue", username);
  const round = rounds[roundIndex % rounds.length];
  const correct = submitted && answer === round.answer;

  function lockCall(call: "dodge" | "queue") {
    if (submitted) {
      return;
    }

    setAnswer(call);
    setSubmitted(true);
    recordStreak(call === round.answer);
  }

  function nextLobby() {
    setRoundIndex((current) => current + 1);
    setAnswer("");
    setSubmitted(false);
  }

  return (
    <PuzzleFrame icon={<CircleSlash size={18} />} title="Dodge or Queue">
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-4">
        <InfiniteStreakBar round={roundIndex + 1} current={streak.current} best={streak.best} />
        <DraftScreen
          blueName="Your Team"
          redName="Enemy Team"
          bluePicks={applyLaneLabels(round.allyTeam.map((champion, index) => championToOption(champion, round.allySpells[index])), laneLabels)}
          redPicks={applyLaneLabels(round.enemyTeam.map((champion, index) => championToOption(champion, round.enemySpells[index])), laneLabels)}
          blueBans={round.allyBans.map((champion) => championToOption(champion))}
          redBans={round.enemyBans.map((champion) => championToOption(champion))}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => lockCall("dodge")}
            disabled={submitted}
            className={cn(
              "font-display min-h-14 rounded-sm border px-4 text-lg font-extrabold transition disabled:cursor-default",
              answer === "dodge"
                ? "border-green-300 bg-green-500 text-[#071018]"
                : "border-green-400/35 bg-green-500/14 text-green-100 hover:bg-green-500/24"
            )}
          >
            Dodge
          </button>
          <button
            type="button"
            onClick={() => lockCall("queue")}
            disabled={submitted}
            className={cn(
              "font-display min-h-14 rounded-sm border px-4 text-lg font-extrabold transition disabled:cursor-default",
              answer === "queue"
                ? "border-red-300 bg-red-500 text-white"
                : "border-red-400/35 bg-red-500/14 text-red-100 hover:bg-red-500/24"
            )}
          >
            Queue
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <ResultPill submitted={submitted} correct={correct} answer={round.answer === "queue" ? "Queue" : "Dodge"} />
          {submitted && (
            <Button type="button" variant="secondary" onClick={nextLobby}>
              Next lobby
            </Button>
          )}
        </div>
        {submitted && (
          <div className="rounded-sm border border-[#3c3421] bg-[#111722] p-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Bar label="Queue" value={round.community.queuePercent} />
              <Bar label="Dodge" value={round.community.dodgePercent} />
            </div>
            <p className="mt-2 text-sm text-[color:var(--muted)]">{round.explanation}</p>
          </div>
        )}
      </div>
    </PuzzleFrame>
  );
}

function createDodgeQueueRounds(base: DodgeQueueChallenge, champions: PublicChampion[]) {
  const hydratedBase = withDodgeQueueSpells(base);

  if (champions.length < 10) {
    return [hydratedBase];
  }

  return [
    hydratedBase,
    ...Array.from({ length: INFINITE_ROUNDS }, (_, index) => createGeneratedDodgeQueueRound(hydratedBase, champions, index + 1))
  ];
}

function withDodgeQueueSpells(challenge: DodgeQueueChallenge): DodgeQueueChallenge {
  if (challenge.allySpells?.length === 5 && challenge.enemySpells?.length === 5) {
    return challenge;
  }

  return {
    ...challenge,
    allySpells: createUiLaneSpellLoadout(`${challenge.id}:ally`),
    enemySpells: createUiLaneSpellLoadout(`${challenge.id}:enemy`)
  };
}

function createGeneratedDodgeQueueRound(base: DodgeQueueChallenge, champions: PublicChampion[], round: number): DodgeQueueChallenge {
  const seed = `${base.date}:dodge-queue-infinite:${round}`;
  const allyTeam = pickUiLaneAwareTeam(champions, `${seed}:ally`, [], 7);
  const enemyTeam = pickUiLaneAwareTeam(champions, `${seed}:enemy`, allyTeam.map((champion) => champion.id), 8);
  const pickedChampionIds = [...allyTeam, ...enemyTeam].map((champion) => champion.id);
  const allyBans = pickUiUnique(champions, `${seed}:ally-bans`, 5, pickedChampionIds);
  const enemyBans = pickUiUnique(champions, `${seed}:enemy-bans`, 5, [...pickedChampionIds, ...allyBans.map((champion) => champion.id)]);
  const allyRoleFit = eloLaneLabels.reduce((score, role, index) => score + laneFitForUi(role, allyTeam[index]), 0);
  const enemyThreat = enemyTeam.reduce((score, champion) => score + (champion.roles.includes("Tank") ? 1 : 0) + (champion.roles.includes("Assassin") ? 1 : 0), 0);
  const dodgeScore = 7 - allyRoleFit + enemyThreat;
  const answer = dodgeScore >= 6 ? "dodge" : "queue";
  const dodgePercent = Math.min(87, Math.max(19, 42 + dodgeScore * 6));

  return {
    ...base,
    id: `${base.date}:dodge-queue:${round}`,
    allyTeam,
    enemyTeam,
    allySpells: createUiLaneSpellLoadout(`${seed}:ally`),
    enemySpells: createUiLaneSpellLoadout(`${seed}:enemy`),
    allyBans,
    enemyBans,
    answer,
    community: {
      dodgePercent,
      queuePercent: 100 - dodgePercent
    },
    explanation:
      answer === "dodge"
        ? "The lobby has enough role mismatch and enemy lockdown pressure that the model recommends dodging."
        : "The comp has workable role coverage and enough playable lanes to queue it up."
  };
}

function createUiLaneSpellLoadout(seed: string) {
  return eloLaneLabels.map((role) => spellsForEloRole(role, `${seed}:${role}:spells`));
}

function pickUiLaneAwareTeam(champions: PublicChampion[], seed: string, excluded: string[], chaosThreshold: number) {
  const excludedSet = new Set(excluded);

  return eloLaneLabels.map((role) => {
    const preferredPool = championsForEloLane(champions, role).filter((champion) => !excludedSet.has(champion.id));
    const available = champions.filter((champion) => !excludedSet.has(champion.id));
    const chaosRoll = hashString(`${seed}:${role}:chaos`) % 10;
    const pool = chaosRoll >= chaosThreshold || preferredPool.length === 0 ? available : preferredPool;
    const champion = pool[hashString(`${seed}:${role}:pick`) % pool.length] ?? available[0] ?? champions[0];
    excludedSet.add(champion.id);
    return champion;
  });
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

function laneFitForUi(role: string, champion: PublicChampion): number {
  if (role === "Jungle") return champion.roles.some((championRole) => ["Assassin", "Fighter", "Tank"].includes(championRole)) ? 1 : 0;
  if (role === "Bot") return champion.roles.includes("Marksman") ? 1 : 0;
  if (role === "Supp") return champion.roles.some((championRole) => ["Support", "Tank"].includes(championRole)) ? 1 : 0;
  if (role === "Mid") return champion.roles.some((championRole) => ["Mage", "Assassin"].includes(championRole)) ? 1 : 0;
  return champion.roles.some((championRole) => ["Fighter", "Tank"].includes(championRole)) ? 1 : 0;
}

function PuzzleFrame({ icon, title, kicker, children }: { icon: ReactNode; title: string; kicker?: string; children: ReactNode }) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-sm border border-[#3c3421] bg-[#071018] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[#c89b3c]">{icon}</span>
        <h2 className="text-xl font-semibold">{title}</h2>
        {kicker && <span className="text-sm text-[color:var(--muted)]">{kicker}</span>}
      </div>
      {children}
    </section>
  );
}

function ChampionLine({ label, champions, compact }: { label: string; champions: Array<{ id: string; name: string; squareUrl: string; roles: string[] }>; compact?: boolean }) {
  return (
    <div className="grid gap-2">
      <div className="text-sm uppercase text-[#c89b3c]">{label}</div>
      <div className={cn("grid gap-2", compact ? "grid-cols-5" : "grid-cols-5")}>
        {champions.map((champion) => (
          <div key={champion.id} className={cn("overflow-hidden rounded-sm border border-white/10 bg-[#111722]", compact && "bg-[#050607]/75")} title={`${champion.name} - ${champion.roles.join(" / ")}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={champion.squareUrl} alt="" className={cn("aspect-square w-full object-contain", compact ? "h-12" : "h-16")} />
            <div className={cn("p-2", compact && "hidden xl:block px-1.5 py-1")}>
              <div className="truncate text-sm font-semibold leading-tight">{champion.name}</div>
              <div className="truncate text-[11px] leading-tight text-[color:var(--muted)]">{champion.roles.join(" / ")}</div>
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
    <div className="grid min-h-0 grid-cols-[1fr_5rem_1fr] gap-3 rounded-sm border border-[#3c3421] bg-[#050607] p-3">
      <DraftTeam side="blue" name={blueName} picks={bluePicks} bans={blueBans} hiddenLabel={hiddenLabel} />
      <div className="grid place-items-center text-center">
        <div className="rounded-full border border-[#3c3421] px-4 py-3 text-xl font-bold text-[#c89b3c]">VS</div>
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
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className={cn("flex items-center gap-2", side === "red" ? "justify-end" : "justify-start")}>
        {side === "red" && <BanCluster bans={bans} />}
        <div className={cn("truncate text-lg font-bold text-[#c89b3c]", side === "red" && "text-right")}>{name}</div>
        {side === "blue" && <BanCluster bans={bans} />}
      </div>
      <div className="grid min-h-0 grid-rows-5 gap-2">
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
    <div className="grid min-h-20 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-sm border border-[#3c3421] bg-[#111722] p-2">
      <div className="relative h-16 w-16 overflow-hidden rounded-sm border border-[#3c3421] bg-[#071018]">
        {pick?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pick.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-[#c89b3c]">?</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-lg font-bold leading-tight">{pick?.label ?? hiddenLabel}</div>
        <div className="truncate text-sm leading-tight text-[#c89b3c]">{pick?.sublabel ?? "Champion select"}</div>
        {pick?.spells && (
          <div className="mt-1 flex gap-1">
            {pick.spells.map((spell) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={spell} src={summonerSpellIcon(spell)} alt={spell} title={spell} className="h-6 w-6 rounded-sm border border-[#3c3421]" />
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

function championToOption(champion: PublicChampion, spells?: string[]): OptionItem {
  return {
    id: champion.id,
    label: champion.name,
    sublabel: champion.roles.join(" / "),
    imageUrl: champion.squareUrl,
    spells
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

const eloLaneLabels = ["Top", "Jungle", "Mid", "Bot", "Supp"];
const eloNonJungleSpellPairs = [
  ["Flash", "Teleport"],
  ["Flash", "Ignite"],
  ["Flash", "Heal"],
  ["Exhaust", "Ignite"],
  ["Barrier", "Flash"],
  ["Cleanse", "Flash"],
  ["Ignite", "Teleport"],
  ["Ghost", "Teleport"],
  ["Heal", "Barrier"]
];
const eloJungleSpellPairs = [
  ["Flash", "Smite"],
  ["Ghost", "Smite"],
  ["Ignite", "Smite"]
];

function createEloRounds(base: GuessEloChallenge, champions: PublicChampion[]): EloRound[] {
  if (champions.length < 10) {
    return [base];
  }

  const generated = Array.from({ length: 36 }, (_, index) => createGeneratedEloRound(base, champions, index + 1));
  return [base, ...generated];
}

function createGeneratedEloRound(base: GuessEloChallenge, champions: PublicChampion[], round: number): EloRound {
  const seed = `${base.date}:guess-elo-infinite:${round}`;
  const lanes = createGeneratedEloTeam(seed, champions, "blue");
  const enemyLanes = createGeneratedEloTeam(seed, champions, "red");
  const chaosScore = scoreEloLanes([...lanes, ...enemyLanes]);
  const answerTier = chaosScore >= 7 ? "Iron/Bronze" : chaosScore >= 4 ? "Silver/Gold" : chaosScore >= 2 ? "Emerald/Diamond" : "Master+";

  return {
    id: `${base.date}:guess-elo:${round}`,
    date: base.date,
    lanes,
    enemyLanes,
    options: base.options,
    answerTier,
    signalNotes: [
      `Comp chaos score: ${chaosScore}`,
      chaosScore >= 4 ? "Off-role picks or strange summoner spells drag the lobby downward." : "Role fit and summoner discipline point higher.",
      "Summoner spells and role fit drive the read."
    ],
    dataSource: base.dataSource
  };
}

function createGeneratedEloTeam(seed: string, champions: PublicChampion[], side: "blue" | "red") {
  return eloLaneLabels.map((role) => {
    const preferredPool = championsForEloLane(champions, role);
    const chaosRoll = hashString(`${seed}:${side}:${role}:chaos`) % 10;
    const pool = chaosRoll >= 7 ? champions : preferredPool;
    const champion = pool[hashString(`${seed}:${side}:${role}:champion`) % pool.length];
    const spells = spellsForEloRole(role, `${seed}:${side}:${role}:spells`);
    return { role, champion, spells };
  });
}

function spellsForEloRole(role: string, seed: string) {
  const pool = role === "Jungle" ? eloJungleSpellPairs : eloNonJungleSpellPairs;
  return pool[hashString(seed) % pool.length];
}

function championsForEloLane(champions: PublicChampion[], role: string) {
  const pool = champions.filter((champion) => {
    if (role === "Top") return champion.roles.some((championRole) => ["Fighter", "Tank"].includes(championRole));
    if (role === "Jungle") return champion.roles.some((championRole) => ["Assassin", "Fighter", "Tank"].includes(championRole));
    if (role === "Mid") return champion.roles.some((championRole) => ["Mage", "Assassin"].includes(championRole));
    if (role === "Bot") return champion.roles.includes("Marksman");
    return champion.roles.some((championRole) => ["Support", "Tank"].includes(championRole));
  });

  return pool.length > 0 ? pool : champions;
}

function scoreEloLanes(lanes: EloRound["lanes"]) {
  return lanes.reduce((total, lane, index) => {
    const smiteMismatch = lane.role === "Jungle" ? (lane.spells.includes("Smite") ? 0 : 4) : (lane.spells.includes("Smite") ? 4 : 0);
    const expected =
      lane.role === "Jungle"
        ? lane.spells.includes("Smite")
        : lane.role === "Bot"
          ? lane.champion.roles.includes("Marksman")
          : lane.role === "Supp"
          ? lane.champion.roles.includes("Support") || lane.champion.roles.includes("Tank")
            : true;
    return total + smiteMismatch + (expected ? 0 : 2) + (lane.spells.includes("Flash") ? 0 : 1) + (index % 5 === 0 && lane.spells.includes("Ignite") ? 1 : 0);
  }, 0);
}

function rankIcons(option: string) {
  if (option === "Iron/Bronze") return [rankIconUrl("iron"), rankIconUrl("bronze")];
  if (option === "Silver/Gold") return [rankIconUrl("silver"), rankIconUrl("gold")];
  if (option === "Emerald/Diamond") return [rankIconUrl("emerald"), rankIconUrl("diamond")];
  return [rankIconUrl("master"), rankIconUrl("challenger")];
}

function rankIconUrl(rank: string) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${rank}.png`;
}

function summonerSpellIcon(spell: string) {
  const fileBySpell: Record<string, string> = {
    Flash: "SummonerFlash",
    Teleport: "SummonerTeleport",
    Smite: "SummonerSmite",
    Ignite: "SummonerDot",
    Heal: "SummonerHeal",
    Exhaust: "SummonerExhaust",
    Ghost: "SummonerHaste",
    Barrier: "SummonerBarrier",
    Cleanse: "SummonerBoost"
  };

  return `https://ddragon.leagueoflegends.com/cdn/16.11.1/img/spell/${fileBySpell[spell] ?? "SummonerFlash"}.png`;
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

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-[color:var(--muted)]">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="mt-1 h-2 rounded bg-white/8">
        <div className="h-2 rounded bg-[color:var(--gold)]" style={{ width: `${value}%` }} />
      </div>
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
