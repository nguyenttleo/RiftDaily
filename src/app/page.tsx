import { ArrowRight, BarChart3, ClipboardList, Crown, MessageSquare, Share2, Swords } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CreatorFooter } from "@/components/creator-footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#050914] text-[#f8fafc]">
      <nav className="fixed left-0 right-0 top-0 z-30 border-b border-white/10 bg-[#050914]/82 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Link href="/" className="font-display text-xl font-extrabold text-[#f5c542]">
            Rift Daily
          </Link>
          <div className="hidden items-center gap-6 text-sm text-[#94a3b8] md:flex">
            <Link href="/play">Play</Link>
            <a href="#leaderboard">Leaderboard</a>
            <a href="#tech">Tech</a>
            <Link href="/suggest">Suggest</Link>
          </div>
          <Link href="/play" className="font-display rounded-md bg-[#f5c542] px-4 py-2 text-sm font-bold text-[#090b10]">
            Play Daily
          </Link>
        </div>
      </nav>

      <section
        className="relative min-h-[92vh] overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: "url(https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ryze_0.jpg)" }}
      >
        <div className="absolute inset-0 bg-[#050914]/78" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,9,20,.98),rgba(5,9,20,.72),rgba(5,9,20,.38))]" />
        <div className="relative mx-auto grid min-h-[92vh] max-w-7xl grid-cols-1 items-center gap-10 px-5 pt-24 lg:grid-cols-[1fr_34rem]">
          <div>
            <div className="font-display mb-4 inline-flex rounded-full border border-[#f5c542]/30 bg-[#f5c542]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#f5c542]">
              Daily League nonsense
            </div>
            <h1 className="font-display max-w-4xl text-6xl font-extrabold leading-[0.95] tracking-tight md:text-8xl">
              Humble your friends with suspiciously useful League homework.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#cbd5e1]">
              Pick the build, judge the lobby, guess the doomed loading screen, and collect enough evidence to tell the
              group chat they were wrong with confidence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/play" className="font-display inline-flex min-h-12 items-center gap-2 rounded-md bg-[#f5c542] px-5 font-bold text-[#090b10]">
                Defeat your friends <ArrowRight size={18} />
              </Link>
              <a href="#leaderboard" className="font-display inline-flex min-h-12 items-center rounded-md border border-white/15 bg-white/6 px-5 font-bold text-white">
                Scout the leaderboard
              </a>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3 text-sm text-[#94a3b8]">
              <LandingStat value="172" label="Champions" />
              <LandingStat value="Daily" label="Seeds" />
              <LandingStat value="AWS" label="Ready" />
            </div>
          </div>

          <div className="hidden rounded-lg border border-white/12 bg-[#0a1020]/92 p-4 shadow-2xl lg:grid">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-display text-sm uppercase text-[#f5c542]">Today&apos;s Build Puzzle</div>
                <div className="text-2xl font-bold">Garen vs ranged control</div>
              </div>
              <Share2 className="text-[#38bdf8]" />
            </div>
            <div className="grid grid-cols-6 gap-2">
              {["3078", "6333", "6631", "3748", "3053", "3047"].map((id, index) => (
                <div key={id} className={`grid min-h-20 place-items-center rounded-sm border p-2 ${index < 3 ? "border-green-400/50 bg-green-500/15" : "border-white/10 bg-white/5"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://ddragon.leagueoflegends.com/cdn/16.11.1/img/item/${id}.png`} alt="" className="h-10 w-10 object-contain" />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md border border-white/10 bg-[#111827] p-3 text-sm text-[#cbd5e1]">
              Rift Daily #42 - solved in 2 tries - streak 5
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-20 md:grid-cols-3">
        <InfoCard icon={<ClipboardList />} title="Queue the chaos" text="Everyone gets the same puzzle set, so the excuses start immediately." />
        <InfoCard icon={<Swords />} title="Make the call" text="Choose builds, solve recipe trees, read cursed loading screens, and dodge whatever is flying at Kennen." />
        <InfoCard icon={<Share2 />} title="Send proof" text="Streaks, leaderboards, and shareable results make your victory annoying in the best way." />
      </section>

      <section id="leaderboard" className="mx-auto grid max-w-7xl gap-8 px-5 py-20 lg:grid-cols-[1fr_28rem]">
        <div>
          <SectionIntro eyebrow="Competition" title="Daily runs need rivals" />
          <p className="mt-4 max-w-2xl text-[#94a3b8]">The platform is structured for authenticated streaks, solve history, and leaderboard entries backed by PostgreSQL.</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#111827] p-5">
          <div className="font-display mb-4 flex items-center gap-2 text-[#f5c542]"><Crown size={18} /> Today&apos;s Top Solves</div>
          {["ZedMain92", "BaronFlip", "LuxQEnjoyer"].map((name, index) => (
            <div key={name} className="grid grid-cols-[2rem_1fr_auto] border-t border-white/8 py-3 text-sm">
              <span className="font-display text-[#f5c542]">{index + 1}</span>
              <span>{name}</span>
              <span className="text-[#94a3b8]">{index + 1} try</span>
            </div>
          ))}
        </div>
      </section>

      <section id="tech" className="border-y border-white/10 bg-[#0a1020] py-20">
        <div className="mx-auto max-w-7xl px-5">
          <SectionIntro eyebrow="Architecture" title="A full-stack daily puzzle engine" />
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {["Next.js", "TypeScript", "PostgreSQL", "AWS Amplify"].map((tech) => (
              <div key={tech} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <BarChart3 className="mb-3 text-[#38bdf8]" />
                <div className="font-display text-lg font-bold">{tech}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="suggest" className="mx-auto max-w-7xl px-5 py-20">
        <div className="rounded-xl border border-white/10 bg-[#111827] p-8">
          <MessageSquare className="mb-4 text-[#f5c542]" />
          <h2 className="font-display text-4xl font-bold">Help shape Rift Daily</h2>
          <p className="mt-3 max-w-2xl text-[#94a3b8]">Suggest puzzle corrections, new game modes, balance feedback, or UI ideas. The form is wired for Supabase/PostgreSQL persistence when deployment env vars are configured.</p>
          <Link href="/suggest" className="font-display mt-6 inline-flex rounded-md bg-[#f5c542] px-5 py-3 font-bold text-[#090b10]">
            Submit a suggestion
          </Link>
        </div>
      </section>

      <CreatorFooter />
    </main>
  );
}

function LandingStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <div className="font-display text-2xl font-bold text-[#f8fafc]">{value}</div>
      <div className="text-xs uppercase tracking-[0.08em]">{label}</div>
    </div>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#111827] p-6">
      <div className="mb-4 text-[#f5c542]">{icon}</div>
      <div className="font-display text-xl font-bold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-[#94a3b8]">{text}</p>
    </div>
  );
}

function SectionIntro({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="font-display text-sm font-bold uppercase tracking-[0.14em] text-[#f5c542]">{eyebrow}</div>
      <h2 className="font-display mt-2 text-4xl font-extrabold tracking-tight md:text-5xl">{title}</h2>
    </div>
  );
}
