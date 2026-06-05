"use client";

import { motion } from "framer-motion";
import { CheckCircle2, HelpCircle, Swords, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { ChampionCombobox } from "@/components/champion-combobox";
import { ShareButton } from "@/components/share-button";
import { Button } from "@/components/ui/button";
import { formatAbilityShare } from "@/game/share";
import { cn } from "@/lib/utils";
import type { AbilityGuessResult, AbilitySlot, PublicAbilityChallenge, PublicChampion } from "@/types";

interface AbilityGameProps {
  challenge: PublicAbilityChallenge;
  champions: PublicChampion[];
  onSolved: () => void;
}

export function AbilityGame({ challenge, champions, onSolved }: AbilityGameProps) {
  const [championId, setChampionId] = useState("");
  const [slot, setSlot] = useState<AbilitySlot>("Q");
  const [guesses, setGuesses] = useState<AbilityGuessResult[]>([]);
  const [startedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const solved = guesses.some((guess) => guess.correct);
  const exhausted = !solved && guesses.length >= challenge.maxAttempts;
  const lastGuess = guesses.at(-1);
  const shareText = useMemo(() => formatAbilityShare(challenge.date, guesses), [challenge.date, guesses]);

  async function submit() {
    if (!championId || busy || solved || exhausted) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/guesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.id,
          challengeType: "ability",
          guess: { championId, slot },
          attemptNumber: guesses.length + 1,
          elapsedMs: Date.now() - startedAt
        })
      });

      if (!response.ok) {
        throw new Error("Guess failed.");
      }

      const result = (await response.json()) as AbilityGuessResult;
      setGuesses((current) => [...current, result]);

      if (result.correct) {
        onSolved();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Guess failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-4 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-4">
        <div className="relative min-h-72 overflow-hidden rounded-md border border-[color:var(--line)] bg-[#07090d]">
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center opacity-35 blur-sm"
            style={{ backgroundImage: `url(${challenge.splashUrl})` }}
          />
          <div className="absolute inset-0 bg-[#080a0f]/72" />
          <div className="relative grid min-h-72 content-between gap-5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-[color:var(--line)] bg-black/30 px-2 py-1 text-xs text-[color:var(--gold-bright)]">
                Ability
              </span>
              <span className="rounded-md border border-white/10 bg-white/6 px-2 py-1 text-xs text-[color:var(--muted)]">
                {challenge.difficulty}
              </span>
              <span className="ml-auto rounded-md border border-white/10 bg-white/6 px-2 py-1 text-xs text-[color:var(--muted)]">
                {guesses.length}/{challenge.maxAttempts}
              </span>
            </div>

            <blockquote className="max-w-3xl text-balance text-2xl font-semibold leading-tight text-[color:var(--foreground)] sm:text-3xl">
              {challenge.clue}
            </blockquote>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <ChampionCombobox champions={champions} value={championId} onChange={setChampionId} label="Champion" />
              <label className="grid gap-2 text-sm text-[color:var(--muted)]">
                <span>Ability</span>
                <div className="grid grid-cols-5 gap-1 rounded-md border border-[color:var(--line)] bg-[#0b0e14] p-1">
                  {challenge.slots.map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      onClick={() => setSlot(candidate)}
                      className={cn(
                        "h-9 w-9 rounded-md text-sm font-bold transition",
                        slot === candidate ? "bg-[color:var(--gold)] text-[#11141c]" : "text-[color:var(--muted)] hover:bg-white/10"
                      )}
                      title={`Select ${candidate}`}
                    >
                      {candidate}
                    </button>
                  ))}
                </div>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={submit} disabled={!championId || busy || solved || exhausted} icon={<Swords size={16} />}>
                Lock
              </Button>
              <ShareButton text={shareText} disabled={guesses.length === 0} />
              {message && <span className="text-sm text-red-200">{message}</span>}
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          {guesses.map((guess, index) => (
            <motion.div
              key={`${guess.attemptNumber}-${index}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2 rounded-md border border-[color:var(--line)] bg-white/6 p-2 text-sm"
            >
              <span className="font-mono text-[color:var(--muted)]">{guess.attemptNumber}</span>
              <StatusPill label="Champion" active={guess.championCorrect} />
              <StatusPill label="Ability" active={guess.slotCorrect} />
            </motion.div>
          ))}
        </div>
      </div>

      <aside className="grid content-start gap-3 rounded-md border border-[color:var(--line)] bg-[#0b0e14] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--gold-bright)]">
          <HelpCircle size={16} />
          Hints
        </div>
        <div className="grid gap-2">
          {(lastGuess?.hints.length ? lastGuess.hints : ["First miss reveals role."]).map((hint) => (
            <div key={hint} className="rounded-md border border-white/10 bg-white/6 px-3 py-2 text-sm text-[color:var(--foreground)]">
              {hint}
            </div>
          ))}
        </div>

        {(lastGuess?.solvedAnswer || exhausted) && (
          <div className="mt-2 rounded-md border border-[color:var(--line)] bg-white/6 p-3">
            {lastGuess?.solvedAnswer ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lastGuess.solvedAnswer.squareUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
                <div>
                  <div className="font-semibold text-[color:var(--foreground)]">
                    {lastGuess.solvedAnswer.championName} {lastGuess.solvedAnswer.slot}
                  </div>
                  <div className="text-sm text-[color:var(--muted)]">{lastGuess.solvedAnswer.abilityName}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[color:var(--muted)]">Answer opens after the final API result.</div>
            )}
          </div>
        )}
      </aside>
    </section>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={cn(
        "flex min-h-10 items-center justify-between rounded-md border px-3",
        active
          ? "border-green-400/40 bg-green-500/16 text-green-100"
          : "border-red-400/30 bg-red-500/12 text-red-100"
      )}
    >
      <span>{label}</span>
      {active ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
    </div>
  );
}
