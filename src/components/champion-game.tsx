"use client";

import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, CheckCircle2, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { ChampionCombobox } from "@/components/champion-combobox";
import { ShareButton } from "@/components/share-button";
import { Button } from "@/components/ui/button";
import { formatChampionShare } from "@/game/share";
import { cn } from "@/lib/utils";
import type {
  ChampionFeedbackRow,
  ChampionGuessResult,
  PublicChampion,
  PublicChampionChallenge
} from "@/types";

interface ChampionGameProps {
  challenge: PublicChampionChallenge;
  champions: PublicChampion[];
  onSolved: () => void;
}

export function ChampionGame({ challenge, champions, onSolved }: ChampionGameProps) {
  const [championId, setChampionId] = useState("");
  const [guesses, setGuesses] = useState<ChampionGuessResult[]>([]);
  const [startedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const solved = guesses.some((guess) => guess.correct);
  const exhausted = !solved && guesses.length >= challenge.maxAttempts;
  const shareText = useMemo(() => formatChampionShare(challenge.date, guesses), [challenge.date, guesses]);
  const answer = guesses.find((guess) => guess.solvedAnswer)?.solvedAnswer;

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
          challengeType: "champion",
          guess: { championId },
          attemptNumber: guesses.length + 1,
          elapsedMs: Date.now() - startedAt
        })
      });

      if (!response.ok) {
        throw new Error("Guess failed.");
      }

      const result = (await response.json()) as ChampionGuessResult;
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
    <section className="grid gap-4 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] p-4">
      <div className="relative min-h-64 overflow-hidden rounded-md border border-[color:var(--line)] bg-[#07090d]">
        <div
          className={cn("absolute inset-0 scale-105 bg-cover bg-center opacity-35 blur-md", solved && "opacity-55 blur-[2px]")}
          style={{ backgroundImage: `url(${answer?.splashUrl ?? challenge.splashUrl})` }}
        />
        <div className="absolute inset-0 bg-[#080a0f]/72" />
        <div className="relative grid min-h-64 content-between gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-[color:var(--line)] bg-black/30 px-2 py-1 text-xs text-[color:var(--gold-bright)]">
              Champion
            </span>
            <span className="rounded-md border border-white/10 bg-white/6 px-2 py-1 text-xs text-[color:var(--muted)]">
              {challenge.difficulty}
            </span>
            <span className="ml-auto rounded-md border border-white/10 bg-white/6 px-2 py-1 text-xs text-[color:var(--muted)]">
              {guesses.length}/{challenge.maxAttempts}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <ChampionCombobox champions={champions} value={championId} onChange={setChampionId} label="Champion" />
            <Button type="button" onClick={submit} disabled={!championId || busy || solved || exhausted} icon={<Search size={16} />}>
              Guess
            </Button>
            <ShareButton text={shareText} disabled={guesses.length === 0} />
          </div>
          {message && <p className="text-sm text-red-200">{message}</p>}
        </div>
      </div>

      <div className="overflow-x-auto fine-scrollbar">
        <div className="min-w-[46rem]">
          <div className="grid grid-cols-[9rem_repeat(4,1fr)] gap-2 px-2 pb-2 text-xs text-[color:var(--muted)]">
            <span>Guess</span>
            <span>Class</span>
            <span>Resource</span>
            <span>Title</span>
            <span>Roster #</span>
          </div>
          <div className="grid gap-2">
            {guesses.map((guess, index) => {
              return (
                <motion.div
                  key={`${guess.attemptNumber}-${index}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-[9rem_repeat(4,1fr)] gap-2 rounded-md border border-[color:var(--line)] bg-white/6 p-2"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="font-mono text-[color:var(--muted)]">{guess.attemptNumber}</span>
                    <span>{guess.guessedChampion.name}</span>
                  </div>
                  {guess.feedback.map((feedback) => (
                    <FeedbackCell key={feedback.key} feedback={feedback} />
                  ))}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {answer && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-[color:var(--line)] bg-white/6 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={answer.squareUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
          <div>
            <div className="font-semibold">{answer.name}</div>
            <div className="text-sm text-[color:var(--muted)]">{answer.title}</div>
          </div>
        </div>
      )}
    </section>
  );
}

function FeedbackCell({ feedback }: { feedback: ChampionFeedbackRow }) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 text-sm",
        feedback.status === "correct" && "border-green-400/40 bg-green-500/16 text-green-100",
        feedback.status === "present" && "border-yellow-300/40 bg-yellow-500/16 text-yellow-100",
        feedback.status === "wrong" && "border-red-400/30 bg-red-500/12 text-red-100",
        (feedback.status === "higher" || feedback.status === "lower") && "border-sky-300/35 bg-sky-500/15 text-sky-100"
      )}
    >
      <span className="truncate">{feedback.guessValue}</span>
      {feedback.status === "correct" && <CheckCircle2 size={15} />}
      {feedback.status === "wrong" && <XCircle size={15} />}
      {feedback.status === "higher" && <ArrowUp size={15} />}
      {feedback.status === "lower" && <ArrowDown size={15} />}
      {feedback.status === "present" && <span className="text-xs">Part</span>}
    </div>
  );
}
