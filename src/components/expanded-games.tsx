"use client";

import { CheckCircle2, CircleSlash, Eye, Link2, PackageSearch, Split, UsersRound, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ChampionConnectionCategory,
  ChampionConnectionChallenge,
  DodgeQueueChallenge,
  EsportsDraftChallenge,
  GameItem,
  GuessEloChallenge,
  ItemBuildChallenge,
  ItemRecipeChallenge,
  OptionItem,
  PublicChampion
} from "@/types";

export function ItemBuildGame({ challenge }: { challenge: ItemBuildChallenge }) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedBoots, setSelectedBoots] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const answerSet = new Set(challenge.answerItemIds);
  const totalCorrect = selectedItems.filter((id) => answerSet.has(id)).length + (selectedBoots === challenge.answerBootsId ? 1 : 0);
  const ready = selectedItems.length === 5 && Boolean(selectedBoots);
  const baselineDelta = challenge.winrateModel.projected - challenge.winrateModel.baseline;
  const correct =
    submitted &&
    ready &&
    selectedItems.every((id) => answerSet.has(id)) &&
    selectedBoots === challenge.answerBootsId;

  function toggleItem(id: string) {
    if (submitted) {
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
    if (!submitted) {
      setSelectedBoots((current) => (current === id ? "" : id));
    }
  }

  function reset() {
    setSelectedItems([]);
    setSelectedBoots("");
    setSubmitted(false);
  }

  function removeItem(id: string) {
    if (!submitted) {
      setSelectedItems((current) => current.filter((item) => item !== id));
    }
  }

  function removeBoots() {
    if (!submitted) {
      setSelectedBoots("");
    }
  }

  return (
    <PuzzleFrame icon={<PackageSearch size={18} />} title="Item Build Puzzle" kicker="Build Wordle: 5 items + boots">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(18rem,34%)_minmax(0,1fr)]">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
          <div className="rounded-sm border border-white/10 bg-[#0b111b] p-3">
            <ChampionLine label="Enemy Team" champions={challenge.enemyTeam} compact />
          </div>
          <div className="relative min-h-0 overflow-hidden rounded-sm border border-[#3c3421] bg-[#071018]">
            <div
              className="absolute inset-0 bg-cover opacity-80"
              style={{
                backgroundImage: `url(${challenge.champion.splashUrl})`,
                backgroundPosition: championSplashPosition(challenge.champion.name)
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050607] via-[#050607]/20 to-transparent" />
          </div>
          <div className="grid gap-3 rounded-sm border border-white/10 bg-[#0b111b] p-4">
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

        <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3">
          <div className="rounded-sm border border-[#3c3421] bg-[#0b111b] p-4">
            <h3 className="font-display text-2xl font-extrabold tracking-tight">
              Build {challenge.champion.name}&apos;s best 5-item setup into this enemy team.
            </h3>
            <p className="mt-1 text-sm text-[color:var(--muted)]">Choose five completed items and one pair of boots. Order does not matter.</p>
          </div>
          <div className="rounded-sm border border-[#3c3421] bg-[#0b111b] p-3 shadow-[inset_0_0_0_1px_rgba(200,155,60,.08)]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm uppercase text-[#c89b3c]">Your Build Row</div>
                <div className="text-xs text-[color:var(--muted)]">Click selected slots to remove mistakes before locking.</div>
              </div>
              <div className="text-xs text-[color:var(--muted)]">{selectedItems.length}/5 items - {selectedBoots ? "boots locked" : "choose boots"}</div>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <BuildSlot
                  key={index}
                  item={challenge.possibleItems.find((item) => item.id === selectedItems[index])}
                  submitted={submitted}
                  correct={submitted && answerSet.has(selectedItems[index])}
                  label={selectedItems[index] ? "Item" : "+ Add Item"}
                  onRemove={selectedItems[index] ? () => removeItem(selectedItems[index]) : undefined}
                />
              ))}
              <BuildSlot
                item={challenge.possibleBoots.find((item) => item.id === selectedBoots)}
                submitted={submitted}
                correct={submitted && selectedBoots === challenge.answerBootsId}
                label={selectedBoots ? "Boots" : "+ Boots"}
                onRemove={selectedBoots ? removeBoots : undefined}
              />
            </div>
          </div>

          <div className="grid min-h-0 items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] rounded-sm border border-white/10 bg-[#0b111b] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm uppercase text-[#c89b3c]">Possible Items</span>
                <span className="text-xs text-[color:var(--muted)]">{challenge.possibleItems.length} role-matched options</span>
              </div>
              <div className="grid min-h-0 content-start gap-2 overflow-y-auto px-1 pb-3 pt-1.5 fine-scrollbar sm:grid-cols-5 2xl:grid-cols-6">
                {challenge.possibleItems.map((item) => (
                  <ItemChoiceCard
                    key={item.id}
                    item={item}
                    selected={selectedItems.includes(item.id)}
                    disabled={!selectedItems.includes(item.id) && selectedItems.length >= 5}
                    onClick={() => toggleItem(item.id)}
                  />
                ))}
              </div>
            </div>
            <div className="flex min-h-0 flex-col rounded-sm border border-white/10 bg-[#0b111b] p-3">
              <div className="mb-2 text-sm uppercase text-[#c89b3c]">Boots</div>
              <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-1 pb-4 pt-1.5 fine-scrollbar">
                {challenge.possibleBoots.map((item) => (
                  <BootChoiceCard key={item.id} item={item} selected={selectedBoots === item.id} onClick={() => chooseBoots(item.id)} />
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2 rounded-sm border border-white/10 bg-[#0b111b] p-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
            <div className="text-sm text-[color:var(--muted)]">
              {submitted ? `${totalCorrect}/6 correct.` : `Selected: ${selectedItems.length}/5 items - ${selectedBoots ? "boots ready" : "choose boots"}`}
            </div>
            <Button type="button" variant="secondary" onClick={reset}>
              Reset
            </Button>
            <Button
              type="button"
              onClick={() => setSubmitted(true)}
              disabled={!ready || submitted}
              className={cn(ready && !submitted && "shadow-[0_0_20px_rgba(245,197,66,.18)]")}
            >
              Submit Build
            </Button>
            <ResultPill submitted={submitted} correct={correct} answer={`${challenge.answerItemIds.length + 1} correct slots`} />
          </div>
          {submitted && (
            <BuildResultPanel challenge={challenge} totalCorrect={totalCorrect} />
          )}
        </div>
      </div>
    </PuzzleFrame>
  );
}

export function ItemRecipeGame({ challenge }: { challenge: ItemRecipeChallenge }) {
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const correct = submitted && answer === challenge.missingComponentId;
  const selected = challenge.allComponents.find((item) => item.id === answer);

  return (
    <PuzzleFrame icon={<Split size={18} />} title="Item Recipe Puzzle" kicker="Fill the missing component">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 rounded-sm border border-[#3c3421] bg-[#0b111b] p-4">
          <div className="grid justify-items-center gap-2">
            <div className="text-sm uppercase text-[#c89b3c]">Result Item</div>
            <ItemShopNode item={challenge.resultItem} size="large" />
          </div>
          <div className="grid min-h-0 content-center gap-4">
            <div className="mx-auto h-10 w-px bg-[#3c3421]" />
            <div className="grid grid-cols-3 items-start gap-3">
              {challenge.knownComponents.map((item) => (
                <ItemShopNode key={item.id} item={item} />
              ))}
              <MissingRecipeNode item={selected} submitted={submitted} correct={correct} />
            </div>
          </div>
          <div className="grid gap-2">
            <div className="text-sm text-[color:var(--muted)]">
              {submitted ? (correct ? "Correct component." : `Correct answer: ${getItemName(challenge.allComponents, challenge.missingComponentId)}`) : "Choose the missing component from the shop grid."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => { setAnswer(""); setSubmitted(false); }}>
                Clear
              </Button>
              <Button type="button" onClick={() => setSubmitted(true)} disabled={!answer || submitted}>
                Lock Component
              </Button>
              <ResultPill submitted={submitted} correct={correct} answer={getItemName(challenge.allComponents, challenge.missingComponentId)} />
            </div>
          </div>
        </div>
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 rounded-sm border border-[#3c3421] bg-[#071018] p-4">
          <div>
            <div className="text-sm uppercase text-[#c89b3c]">Component Shop</div>
            <div className="text-xs text-[color:var(--muted)]">All purchasable League components that build into larger items.</div>
          </div>
          <div className="grid min-h-0 content-start gap-2 overflow-y-auto pr-1 fine-scrollbar sm:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
            {challenge.allComponents.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setAnswer(item.id);
                  setSubmitted(false);
                }}
                className={cn(
                  "grid aspect-square place-items-center rounded-sm border bg-[#111722] p-1 transition duration-150 hover:scale-[1.025] hover:border-[#c89b3c] hover:shadow-[0_0_18px_rgba(245,197,66,.16)]",
                  answer === item.id ? "border-[#c89b3c] ring-2 ring-[#c89b3c]/35" : "border-[#26313f]"
                )}
                title={item.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl} alt="" className="h-9 w-9 object-contain" />
                <span className="line-clamp-2 text-center text-[9px] leading-tight">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </PuzzleFrame>
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

function ItemChoiceCard({ item, selected, disabled, onClick }: { item: GameItem; selected: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative grid min-h-16 content-center justify-items-center gap-1 rounded-sm border bg-[#111722] p-1.5 text-center transition duration-150 hover:scale-[1.025] hover:border-[#c89b3c] hover:shadow-[0_0_18px_rgba(245,197,66,.16)] disabled:cursor-not-allowed disabled:opacity-35",
        selected ? "border-[#c89b3c] bg-[#c89b3c]/14 shadow-[inset_0_0_0_1px_rgba(245,197,66,.25)]" : "border-[#26313f]"
      )}
      title={item.name}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#c89b3c] text-[#071018]">
          <CheckCircle2 size={13} />
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt="" className="h-8 w-8 object-contain" />
      <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{item.name}</span>
    </button>
  );
}

function BootChoiceCard({ item, selected, onClick }: { item: GameItem; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative grid grid-cols-[2rem_1fr] items-center gap-2 rounded-sm border bg-[#111722] p-2 text-left transition duration-150 hover:scale-[1.025] hover:border-[#c89b3c] hover:shadow-[0_0_18px_rgba(245,197,66,.16)]",
        selected ? "border-[#c89b3c] bg-[#c89b3c]/14 shadow-[inset_0_0_0_1px_rgba(245,197,66,.25)]" : "border-[#26313f]"
      )}
      title={item.name}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#c89b3c] text-[#071018]">
          <CheckCircle2 size={11} />
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt="" className="h-8 w-8 object-contain" />
      <span className="truncate text-xs font-semibold">{item.name}</span>
    </button>
  );
}

function BuildResultPanel({ challenge, totalCorrect }: { challenge: ItemBuildChallenge; totalCorrect: number }) {
  const targetItems = challenge.answerItemIds
    .map((id) => challenge.possibleItems.find((item) => item.id === id))
    .filter(Boolean) as GameItem[];
  const targetBoots = challenge.possibleBoots.find((item) => item.id === challenge.answerBootsId);
  const targetBuild = targetBoots ? [...targetItems, targetBoots] : targetItems;
  const shareRow = [...challenge.answerItemIds.map(() => "correct"), challenge.answerBootsId].map((_, index) =>
    index < totalCorrect ? "G" : "X"
  );

  return (
    <div className="grid gap-3 rounded-sm border border-[#3c3421] bg-[#111722] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-lg font-bold text-[#c89b3c]">Result: {totalCorrect}/6 correct</div>
          <div className="text-xs text-[color:var(--muted)]">Target build from the matchup model</div>
        </div>
        <div className="rounded-sm border border-white/10 bg-[#050607] px-3 py-2 text-xs text-[color:var(--muted)]">
          Rift Daily - Build Puzzle - {challenge.champion.name} - {shareRow.join("")}
        </div>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {targetBuild.map((item) => (
          <div key={item.id} className="grid min-h-16 place-items-center rounded-sm border border-green-400/45 bg-green-500/12 p-1 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt="" className="h-8 w-8 object-contain" />
            <span className="line-clamp-2 text-[10px] font-semibold leading-tight">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemShopNode({ item, size = "normal" }: { item: GameItem; size?: "normal" | "large" }) {
  return (
    <div className={cn("grid justify-items-center gap-1 rounded-sm border border-[#3c3421] bg-[#111722] p-2 text-center", size === "large" && "min-w-36 p-3")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt="" className={cn("object-contain", size === "large" ? "h-14 w-14" : "h-10 w-10")} />
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
          <img src={item.imageUrl} alt="" className="h-10 w-10 object-contain" />
          <span className="line-clamp-2 text-xs font-semibold leading-tight">{item.name}</span>
          <span className="text-[10px] text-[#c89b3c]">{item.goldTotal}g</span>
        </>
      ) : (
        <>
          <span className="grid h-10 w-10 place-items-center rounded-sm border border-[#3c3421] text-xl text-[#c89b3c]">?</span>
          <span className="text-xs uppercase text-[color:var(--muted)]">Missing</span>
        </>
      )}
    </div>
  );
}

export function EsportsDraftGame({ challenge, championOptions }: { challenge: EsportsDraftChallenge; championOptions: OptionItem[] }) {
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const selected = championOptions.find((option) => option.id === answer)?.label ?? "";
  const correct = submitted && normalize(selected) === normalize(challenge.answerChampionName);
  const blueDraftPicks = challenge.bluePicks.map((name) => championOptionByName(championOptions, name));
  const redDraftPicks = [
    ...challenge.redPicks.map((name) => championOptionByName(championOptions, name)),
    {
      id: "final-pick-placeholder",
      label: "Final Pick",
      sublabel: challenge.answerLane ?? "Top"
    }
  ];

  return (
    <PuzzleFrame icon={<Eye size={18} />} title="Esports Draft Puzzle" kicker={challenge.source}>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-4">
        <div className="rounded-sm border border-[#3c3421] bg-[#071018] p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm text-[color:var(--muted)]">{challenge.event}</div>
              <div className="text-lg font-semibold">
                {challenge.blueTeam} vs {challenge.redTeam}
              </div>
            </div>
            <div className="rounded-sm border border-[#3c3421] px-2 py-1 text-xs text-[color:var(--muted)]">{challenge.patch}</div>
          </div>
        </div>
        <DraftScreen
          blueName={challenge.blueTeam}
          redName={challenge.redTeam}
          bluePicks={applyLaneLabels(blueDraftPicks, challenge.bluePickLanes)}
          redPicks={applyLaneLabels(redDraftPicks, [...(challenge.redPickLanes ?? []), challenge.answerLane ?? "Top"])}
          blueBans={challenge.blueBans.map((name) => championOptionByName(championOptions, name))}
          redBans={challenge.redBans.map((name) => championOptionByName(championOptions, name))}
          hiddenLabel="Final Pick"
        />
        <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <SearchableSelect label="Final red pick" placeholder="Type a champion" value={answer} onChange={setAnswer} options={championOptions} />
          <Button type="button" onClick={() => setSubmitted(true)} disabled={!answer}>
            Submit
          </Button>
          <ResultPill submitted={submitted} correct={correct} answer={challenge.answerChampionName} />
        </div>
      </div>
    </PuzzleFrame>
  );
}

type EloRound = Pick<GuessEloChallenge, "id" | "date" | "lanes" | "enemyLanes" | "options" | "answerTier" | "signalNotes" | "dataSource">;

export function GuessEloGame({ challenge, champions }: { challenge: GuessEloChallenge; champions: PublicChampion[] }) {
  const rounds = useMemo(() => createEloRounds(challenge, champions), [challenge, champions]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const round = rounds[roundIndex % rounds.length];
  const correct = submitted && answer === round.answerTier;

  function choose(option: string) {
    if (submitted) {
      return;
    }

    setAnswer(option);
    setSubmitted(true);

    if (option === round.answerTier) {
      setScore((current) => current + 1);
    }
  }

  function nextRound() {
    setRoundIndex((current) => current + 1);
    setAnswer("");
    setSubmitted(false);
  }

  return (
    <PuzzleFrame icon={<UsersRound size={18} />} title="Guess the Elo" kicker={`${round.dataSource} - Infinite queue`}>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-4">
        <div className="flex items-center justify-between rounded-sm border border-[#3c3421] bg-[#111722] px-3 py-2 text-sm">
          <span className="text-[#c89b3c]">Round {roundIndex + 1}</span>
          <span className="text-[color:var(--muted)]">Score {score}/{roundIndex + (submitted ? 1 : 0)}</span>
        </div>
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

export function ChampionConnectionGame({ challenge }: { challenge: ChampionConnectionChallenge }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [solved, setSolved] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState("");
  const solvedCategories = challenge.categories.filter((category) => solved.includes(category.id));
  const remaining = challenge.champions.filter((champion) => !solvedCategories.some((category) => category.championIds.includes(champion.id)));

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length < 4 ? [...current, id] : current));
  }

  function submit() {
    const match = challenge.categories.find(
      (category) => !solved.includes(category.id) && category.championIds.every((id) => selected.includes(id))
    );

    if (match) {
      setSolved((current) => [...current, match.id]);
      setSelected([]);
      setFeedback(`Solved: ${match.label}`);
    } else {
      const nearest = challenge.categories
        .filter((category) => !solved.includes(category.id))
        .map((category) => ({
          category,
          overlap: category.championIds.filter((id) => selected.includes(id)).length
        }))
        .sort((a, b) => b.overlap - a.overlap)[0];
      const closeNames = selected
        .filter((id) => nearest?.category.championIds.includes(id))
        .map((id) => challenge.champions.find((champion) => champion.id === id)?.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(" + ");
      setMistakes((current) => current + 1);
      setFeedback(
        nearest && nearest.overlap >= 2
          ? `${nearest.overlap}/4 of a group. Hint: ${closeNames || "some of those picks"} belong together.`
          : "No close group found. Hint: try grouping by region, class, resource, or signature mechanics."
      );
    }
  }

  return (
    <PuzzleFrame icon={<Link2 size={18} />} title="Champion Connections" kicker="Group 16 champions into four sets">
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
        <div className="grid grid-cols-4 gap-2">
          {solvedCategories.map((category) => (
            <div key={category.id} className={cn("rounded-sm border p-2 text-center text-sm", connectionClass(category.difficulty))}>
              <div className="font-bold">{category.label}</div>
              <div className="mt-1 truncate text-xs">{category.championIds.map((id) => challenge.champions.find((champion) => champion.id === id)?.name).join(", ")}</div>
            </div>
          ))}
        </div>
        <div className="grid min-h-0 grid-cols-4 grid-rows-4 gap-2">
          {remaining.map((champion) => (
            <button
              key={champion.id}
              type="button"
              onClick={() => toggle(champion.id)}
              className={cn(
                "grid min-h-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-sm border border-[#3c3421] bg-[#111722] p-2 text-left transition hover:border-[#c89b3c]",
                selected.includes(champion.id) && "border-[#c89b3c] ring-2 ring-[#c89b3c]/50"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={champion.squareUrl} alt="" className="h-11 w-11 rounded-sm border border-[#3c3421] object-contain" />
              <span className="min-w-0 truncate text-sm font-bold">{champion.name}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={submit} disabled={selected.length !== 4}>
            Submit group
          </Button>
          <span className="text-sm text-[color:var(--muted)]">Mistakes: {mistakes}</span>
          <span className="text-sm text-[color:var(--muted)]">Solved: {solved.length}/4</span>
          {feedback && <span className="text-sm text-[#c89b3c]">{feedback}</span>}
        </div>
      </div>
    </PuzzleFrame>
  );
}

export function DodgeQueueGame({ challenge }: { challenge: DodgeQueueChallenge }) {
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const correct = submitted && answer === challenge.answer;

  function lockCall(call: "dodge" | "queue") {
    if (submitted) {
      return;
    }

    setAnswer(call);
    setSubmitted(true);
  }

  return (
    <PuzzleFrame icon={<CircleSlash size={18} />} title="Dodge or Queue" kicker="Champ-select risk call">
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-4">
        <DraftScreen
          blueName="Your Team"
          redName="Enemy Team"
          bluePicks={applyLaneLabels(challenge.allyTeam.map(championToOption), laneLabels)}
          redPicks={applyLaneLabels(challenge.enemyTeam.map(championToOption), laneLabels)}
          blueBans={challenge.allyBans.map(championToOption)}
          redBans={challenge.enemyBans.map(championToOption)}
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
          <ResultPill submitted={submitted} correct={correct} answer={challenge.answer === "queue" ? "Queue" : "Dodge"} />
        </div>
        {submitted && (
          <div className="rounded-sm border border-[#3c3421] bg-[#111722] p-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Bar label="Queue" value={challenge.community.queuePercent} />
              <Bar label="Dodge" value={challenge.community.dodgePercent} />
            </div>
            <p className="mt-2 text-sm text-[color:var(--muted)]">{challenge.explanation}</p>
          </div>
        )}
      </div>
    </PuzzleFrame>
  );
}

function PuzzleFrame({ icon, title, kicker, children }: { icon: ReactNode; title: string; kicker: string; children: ReactNode }) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-sm border border-[#3c3421] bg-[#071018] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[#c89b3c]">{icon}</span>
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="text-sm text-[color:var(--muted)]">{kicker}</span>
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

function championOptionByName(options: OptionItem[], name: string): OptionItem | undefined {
  return options.find((option) => normalize(option.label) === normalize(name));
}

function championToOption(champion: PublicChampion): OptionItem {
  return {
    id: champion.id,
    label: champion.name,
    sublabel: champion.roles.join(" / "),
    imageUrl: champion.squareUrl
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
const eloSpellPairs = [
  ["Flash", "Teleport"],
  ["Flash", "Smite"],
  ["Flash", "Ignite"],
  ["Flash", "Heal"],
  ["Exhaust", "Ignite"],
  ["Ghost", "Smite"],
  ["Barrier", "Flash"],
  ["Cleanse", "Flash"],
  ["Ignite", "Teleport"],
  ["Ghost", "Teleport"],
  ["Heal", "Barrier"]
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
      `Draft chaos score: ${chaosScore}`,
      chaosScore >= 4 ? "Off-role picks or strange summoner spells drag the lobby downward." : "Role fit and summoner discipline point higher.",
      "Infinite mode uses Riot champion classes plus deterministic loading-screen heuristics."
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
    const spells = eloSpellPairs[hashString(`${seed}:${side}:${role}:spells`) % eloSpellPairs.length];
    return { role, champion, spells };
  });
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
    const expected =
      lane.role === "Jungle"
        ? lane.spells.includes("Smite")
        : lane.role === "Bot"
          ? lane.champion.roles.includes("Marksman")
          : lane.role === "Supp"
            ? lane.champion.roles.includes("Support") || lane.champion.roles.includes("Tank")
            : true;
    return total + (expected ? 0 : 2) + (lane.spells.includes("Flash") ? 0 : 1) + (index % 5 === 0 && lane.spells.includes("Ignite") ? 1 : 0);
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

function connectionClass(difficulty: ChampionConnectionCategory["difficulty"]) {
  if (difficulty === "yellow") return "border-yellow-300/40 bg-yellow-500/18 text-yellow-50";
  if (difficulty === "green") return "border-green-300/40 bg-green-500/18 text-green-50";
  if (difficulty === "blue") return "border-sky-300/40 bg-sky-500/18 text-sky-50";
  return "border-violet-300/40 bg-violet-500/18 text-violet-50";
}
