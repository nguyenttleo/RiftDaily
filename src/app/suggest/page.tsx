import Link from "next/link";

import { CreatorFooter } from "@/components/creator-footer";
import { RiftCommandBar } from "@/components/rift-command-bar";
import { SuggestionForm } from "@/components/suggestion-form";

export default function SuggestPage() {
  return (
    <main className="min-h-screen bg-[#050914] text-[#f8fafc]">
      <RiftCommandBar includeInfoLinks />
      <section className="mx-auto grid max-w-4xl gap-6 px-5 pb-8 pt-36 sm:pb-12 xl:pt-32">
        <Link href="/" className="font-display text-sm font-bold uppercase tracking-[0.12em] text-[#f5c542]">
          Rift Daily
        </Link>
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Suggest something beautifully unhinged.</h1>
          <p className="mt-4 max-w-2xl text-[#94a3b8]">
            Send puzzle corrections, balance debates, game-mode ideas, UI feedback, or anything you want.
          </p>
        </div>
        <SuggestionForm />
      </section>
      <CreatorFooter showSuggestions={false} />
    </main>
  );
}
