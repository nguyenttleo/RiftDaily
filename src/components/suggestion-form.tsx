"use client";

import { Send } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const suggestionEmail = "leo@playriftdaily.io";
const suggestionTypes = [
  "New game mode",
  "Puzzle correction",
  "Balance feedback",
  "Bug report",
  "UI/UX feedback",
  "Feature request",
  "Other"
];

export function SuggestionForm() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [type, setType] = useState(suggestionTypes[0]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [detail, setDetail] = useState("");
  const emailHref = buildSuggestionEmailHref({ name, contact, type, message });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setDetail("");
    const response = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, contact, type, message, page: "suggest" })
    });
    const body = (await response.json().catch(() => ({}))) as {
      persisted?: boolean;
      emailed?: boolean;
      emailReason?: string;
      error?: string;
    };

    if (!response.ok) {
      setStatus("error");
      setDetail(body.error ?? "Suggestion could not be submitted.");
      return;
    }

    setStatus("sent");
    if (body.emailed) {
      setDetail(body.persisted ? "Saved and emailed to the developer." : "Emailed to the developer.");
    } else {
      setDetail(body.persisted ? "Saved. Thanks for the suggestion." : "Thanks for the suggestion.");
    }
    setMessage("");
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 grid w-[min(calc(100vw-2rem),17rem)] gap-3 rounded-2xl border border-[var(--line)] bg-[rgba(11,13,20,.92)] p-3.5 shadow-[var(--shadow-lg)] backdrop-blur-md">
        <div>
          <div className="font-display text-sm font-bold text-[var(--foreground)]">Email suggestions</div>
          <div className="mt-1 text-xs leading-snug text-[var(--muted)]">Send feedback directly to the developer.</div>
        </div>
        <a href={emailHref} className="btn-ghost min-h-9 px-4 text-sm">
          Email
        </a>
      </div>

      <form onSubmit={submit} className="surface grid gap-4 p-4 sm:p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-[var(--muted)]">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Optional"
            className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--background-deep)] px-3 text-[var(--foreground)] outline-none transition focus:border-[var(--line-gold)] placeholder:text-[var(--muted-soft)]"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-[var(--muted)]">
          Email or Discord
          <input
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="Optional"
            className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--background-deep)] px-3 text-[var(--foreground)] outline-none transition focus:border-[var(--line-gold)] placeholder:text-[var(--muted-soft)]"
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm text-[#94a3b8]">
        Suggestion type
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--background-deep)] px-3 text-[var(--foreground)] outline-none transition focus:border-[var(--line-gold)]"
        >
          {suggestionTypes.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm text-[#94a3b8]">
        Message
        <textarea
          value={message}
          required
          minLength={10}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Tell me what is broken, funny, unfair, cursed, or secretly brilliant."
          className="min-h-36 resize-y rounded-xl border border-[var(--line)] bg-[var(--background-deep)] p-3 text-[var(--foreground)] outline-none transition focus:border-[var(--line-gold)] placeholder:text-[var(--muted-soft)]"
        />
      </label>
      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center">
        <Button type="submit" disabled={status === "sending"} icon={<Send size={16} />} className="w-full sm:w-auto">
          {status === "sending" ? "Sending" : "Submit suggestion"}
        </Button>
        {detail && (
          <span className={status === "error" ? "text-sm text-[#ffb4ba]" : "text-sm text-[var(--gold)]"}>{detail}</span>
        )}
      </div>
      </form>
    </>
  );
}

function buildSuggestionEmailHref(input: { name: string; contact: string; type: string; message: string }) {
  const body = [
    `Type: ${input.type}`,
    input.name.trim() ? `Name: ${input.name.trim()}` : "Name: ",
    input.contact.trim() ? `Contact: ${input.contact.trim()}` : "Contact: ",
    "",
    "Suggestion:",
    input.message.trim()
  ].join("\n");

  return `mailto:${suggestionEmail}?subject=${encodeURIComponent(`Rift Daily suggestion: ${input.type}`)}&body=${encodeURIComponent(body)}`;
}
