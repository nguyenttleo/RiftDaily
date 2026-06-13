import Link from "next/link";

import { CreatorFooter } from "@/components/creator-footer";
import { RiftCommandBar } from "@/components/rift-command-bar";
import { SuggestionForm } from "@/components/suggestion-form";

export default function SuggestPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <RiftCommandBar includeInfoLinks />
      <section className="mx-auto grid max-w-4xl gap-6 px-6 pb-8 pt-36 sm:pb-12 xl:pt-32">
        <Link href="/" className="eyebrow w-fit">
          Rift Daily
        </Link>
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Suggest something beautifully unhinged.</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            Send puzzle corrections, balance debates, game-mode ideas, UI feedback, or anything you want.
          </p>
        </div>
        <SuggestionForm />
      </section>
      <CreatorFooter showSuggestions={false} />
    </main>
  );
}
