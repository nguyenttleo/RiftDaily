"use client";

import { LogIn, LogOut, UserPlus } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { parseLeagueRankState, rankedStorageKey } from "@/game/scoring";

const passwordRequirementText = "Password must be 8-128 characters.";

export function AuthPanel({ onAuthChange }: { onAuthChange: () => void }) {
  const { data: session, status } = useSession();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const claimAttemptedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      claimAttemptedForUser.current = null;
      return;
    }

    if (claimAttemptedForUser.current === session.user.id) {
      return;
    }

    claimAttemptedForUser.current = session.user.id;

    void claimGuestProgress().then((claimed) => {
      if (claimed) {
        onAuthChange();
      }
    });
  }, [onAuthChange, session?.user?.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (mode === "register") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password })
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? "Registration failed.");
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false
      });

      if (result?.error) {
        throw new Error("Sign in failed.");
      }

      await claimGuestProgress();
      setExpanded(false);
      onAuthChange();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return <div className="h-10 w-40 animate-pulse rounded-md bg-white/10" />;
  }

  if (session?.user) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="rounded-md border border-[color:var(--line)] bg-white/6 px-3 py-2 text-sm">
          {session.user.username ?? session.user.name}
        </div>
        <Button
          type="button"
          variant="ghost"
          icon={<LogOut size={16} />}
          onClick={async () => {
            await signOut({ redirect: false });
            onAuthChange();
          }}
          title="Sign out"
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="relative grid w-full gap-2 overflow-hidden rounded-xl border border-[#c89b3c]/24 bg-[linear-gradient(180deg,rgba(17,24,34,.96),rgba(7,10,15,.96))] p-3 shadow-[0_18px_46px_rgba(0,0,0,.36),inset_0_1px_0_rgba(255,255,255,.06)]"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#c89b3c]/10 blur-2xl" />
      <div>
        <div className="font-display text-sm font-semibold text-[color:var(--gold-bright)]">Save progress</div>
      </div>

      {!expanded && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setExpanded(true)} icon={<LogIn size={16} />} className="w-full sm:w-auto">
            Sign in
          </Button>
        </div>
      )}

      {expanded && (
        <>
      <div className="flex items-center gap-1 rounded-md bg-white/6 p-1">
        <button
          type="button"
          className={`min-h-8 flex-1 rounded-md px-2 text-sm ${mode === "signin" ? "bg-[color:var(--gold)] text-[#11141c]" : "text-[color:var(--muted)]"}`}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`min-h-8 flex-1 rounded-md px-2 text-sm ${mode === "register" ? "bg-[color:var(--gold)] text-[#11141c]" : "text-[color:var(--muted)]"}`}
          onClick={() => setMode("register")}
        >
          Create
        </button>
      </div>

      {mode === "register" && (
        <label className="grid gap-1.5">
          <span className="font-display text-xs font-bold uppercase tracking-[0.08em] text-[#c89b3c]">Display Name</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Display Name"
            minLength={3}
            maxLength={24}
            className="min-h-10 rounded-md border border-[color:var(--line)] bg-[#080a0f] px-3 text-sm"
            required
          />
        </label>
      )}

      <label className="grid gap-1.5">
        <span className="font-display text-xs font-bold uppercase tracking-[0.08em] text-[#c89b3c]">Email</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          type="email"
          className="min-h-10 rounded-md border border-[color:var(--line)] bg-[#080a0f] px-3 text-sm"
          required
        />
      </label>
      <label className="grid gap-1.5">
        <span className="font-display text-xs font-bold uppercase tracking-[0.08em] text-[#c89b3c]">Password</span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          type="password"
          minLength={8}
          maxLength={128}
          aria-describedby={mode === "register" ? "password-requirements" : undefined}
          className="min-h-10 rounded-md border border-[color:var(--line)] bg-[#080a0f] px-3 text-sm"
          required
        />
      </label>
      {mode === "register" && (
        <p id="password-requirements" className="rounded-md border border-white/10 bg-white/[0.045] px-3 py-2 text-xs leading-5 text-[color:var(--muted)]">
          {passwordRequirementText}
        </p>
      )}

      {message && <p className="text-sm text-red-200">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} icon={mode === "register" ? <UserPlus size={16} /> : <LogIn size={16} />} className="w-full sm:w-auto">
          {mode === "register" ? "Create" : "Sign in"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setExpanded(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
        </>
      )}
    </form>
  );
}

const claimableModeStorageKeys = [
  { gameKey: "item-build", keys: ["rift-daily:item-build:guest"] },
  { gameKey: "item-recipe", keys: ["rift-daily:item-recipe:guest"] },
  { gameKey: "guess-elo", keys: ["rift-daily:guess-elo:guest"] },
  { gameKey: "champion-matchup", keys: ["rift-daily:champion-matchup:guest"] },
  { gameKey: "dodge-queue", keys: ["rift-daily:dodge-queue:guest"] },
  { gameKey: "skillshot-dodge", keys: ["rift-daily:mode-streak:skillshot-dodge:Guest", "rift-daily:mode-streak:skillshot-dodge:guest"] }
] as const;

type ClaimableGameKey = (typeof claimableModeStorageKeys)[number]["gameKey"];

type LocalModeClaim = {
  gameKey: ClaimableGameKey;
  currentStreak: number;
  bestStreak: number;
  gamesPlayed: number;
  wins: number;
};

type LocalModeStreak = Omit<LocalModeClaim, "gameKey">;

type GuestProgressPayload = {
  modes: LocalModeClaim[];
  rankState: ReturnType<typeof parseLeagueRankState>;
};

async function claimGuestProgress(): Promise<boolean> {
  const progress = readGuestProgress();

  if (!progress) {
    return false;
  }

  try {
    const response = await fetch("/api/stats/claim-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(progress.payload)
    });

    if (!response.ok) {
      return false;
    }

    clearGuestProgress(progress.keysToClear);
    window.dispatchEvent(new Event("rift-daily:streak-updated"));
    return true;
  } catch {
    return false;
  }
}

function readGuestProgress(): { payload: GuestProgressPayload; keysToClear: string[] } | null {
  if (typeof window === "undefined") {
    return null;
  }

  const keysToClear = new Set<string>();
  const modes = claimableModeStorageKeys
    .map(({ gameKey, keys }) => {
      const streaks = keys
        .map((key) => {
          const streak = readGuestModeStreak(key);

          if (streak) {
            keysToClear.add(key);
          }

          return streak;
        })
        .filter((streak): streak is LocalModeStreak => Boolean(streak));

      if (streaks.length === 0) {
        return null;
      }

      return {
        gameKey,
        currentStreak: Math.max(...streaks.map((streak) => streak.currentStreak)),
        bestStreak: Math.max(...streaks.map((streak) => streak.bestStreak)),
        gamesPlayed: Math.max(...streaks.map((streak) => streak.gamesPlayed)),
        wins: Math.max(...streaks.map((streak) => streak.wins))
      };
    })
    .filter((mode): mode is LocalModeClaim => mode !== null)
    .filter((mode) => mode.gamesPlayed > 0 || mode.currentStreak > 0 || mode.bestStreak > 0);

  const rankKey = rankedStorageKey("Guest");
  const rankState = parseLeagueRankState(window.localStorage.getItem(rankKey));

  if (rankState && (rankState.gamesPlayed > 0 || rankState.tier !== "Unranked" || rankState.lp > 0)) {
    keysToClear.add(rankKey);
  }

  if (modes.length === 0 && keysToClear.size === 0) {
    return null;
  }

  return {
    payload: {
      modes,
      rankState
    },
    keysToClear: [...keysToClear]
  };
}

function readGuestModeStreak(key: string): LocalModeStreak | null {
  const raw = window.localStorage.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<{ current: number; best: number; played: number; wins: number }>;
    const gamesPlayed = Math.max(0, Math.round(Number(parsed.played ?? 0)));
    const currentStreak = Math.max(0, Math.round(Number(parsed.current ?? 0)));
    const bestStreak = Math.max(currentStreak, Math.round(Number(parsed.best ?? 0)));
    const wins = Math.max(0, Math.min(gamesPlayed, Math.round(Number(parsed.wins ?? 0))));

    if (gamesPlayed === 0 && currentStreak === 0 && bestStreak === 0) {
      return null;
    }

    return {
      currentStreak,
      bestStreak,
      gamesPlayed,
      wins
    };
  } catch {
    return null;
  }
}

function clearGuestProgress(keys: string[]) {
  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
}
