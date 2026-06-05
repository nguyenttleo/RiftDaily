"use client";

import { Send } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setDetail("");

    const response = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, contact, type, message, page: "suggest" })
    });
    const body = (await response.json().catch(() => ({}))) as { persisted?: boolean; error?: string };

    if (!response.ok) {
      setStatus("error");
      setDetail(body.error ?? "Suggestion could not be submitted.");
      return;
    }

    setStatus("sent");
    setDetail(body.persisted ? "Saved to the suggestion table." : "Captured locally. Add a Supabase DB URL to persist it.");
    setMessage("");
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border border-white/10 bg-[#111827] p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm text-[#94a3b8]">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Optional"
            className="min-h-11 rounded-md border border-white/10 bg-[#050914] px-3 text-[#f8fafc] placeholder:text-[#64748b]"
          />
        </label>
        <label className="grid gap-2 text-sm text-[#94a3b8]">
          Email or Discord
          <input
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="Optional"
            className="min-h-11 rounded-md border border-white/10 bg-[#050914] px-3 text-[#f8fafc] placeholder:text-[#64748b]"
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm text-[#94a3b8]">
        Suggestion type
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="min-h-11 rounded-md border border-white/10 bg-[#050914] px-3 text-[#f8fafc]"
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
          className="min-h-36 resize-y rounded-md border border-white/10 bg-[#050914] p-3 text-[#f8fafc] placeholder:text-[#64748b]"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={status === "sending"} icon={<Send size={16} />}>
          {status === "sending" ? "Sending" : "Submit suggestion"}
        </Button>
        {detail && (
          <span className={status === "error" ? "text-sm text-red-200" : "text-sm text-[#f5c542]"}>{detail}</span>
        )}
      </div>
    </form>
  );
}
