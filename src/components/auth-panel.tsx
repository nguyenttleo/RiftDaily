"use client";

import { LogIn, LogOut, UserPlus } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";

export function AuthPanel({ onAuthChange }: { onAuthChange: () => void }) {
  const { data: session, status } = useSession();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
    <form onSubmit={submit} className="grid w-full gap-2 rounded-md border border-[color:var(--line)] bg-[#0b0e14]/92 p-3">
      <div>
        <div className="font-display text-sm font-semibold text-[color:var(--gold-bright)]">Save your progress</div>
        <p className="mt-1 text-xs text-[color:var(--muted)]">Keep streaks, stats, and leaderboard scores.</p>
      </div>

      {!expanded && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setExpanded(true)} icon={<LogIn size={16} />}>
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
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          className="min-h-10 rounded-md border border-[color:var(--line)] bg-[#080a0f] px-3 text-sm"
          required
        />
      )}

      <input
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email"
        type="email"
        className="min-h-10 rounded-md border border-[color:var(--line)] bg-[#080a0f] px-3 text-sm"
        required
      />
      <input
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Password"
        type="password"
        className="min-h-10 rounded-md border border-[color:var(--line)] bg-[#080a0f] px-3 text-sm"
        required
      />

      {message && <p className="text-sm text-red-200">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} icon={mode === "register" ? <UserPlus size={16} /> : <LogIn size={16} />}>
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
