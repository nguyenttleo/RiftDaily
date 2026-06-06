import { ArrowRight, BarChart3, ClipboardList, Crown, Cpu, MessageSquare, Share2, Sparkle, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CreatorFooter } from "@/components/creator-footer";
import { getLatestDataDragonVersion, getLiveGameItems, getLivePublicChampions } from "@/lib/riot/data-dragon";

export default async function Home() {
  const version = await getLatestDataDragonVersion();
  const [publicChampions, liveItems] = await Promise.all([
    getLivePublicChampions(version),
    getLiveGameItems(version)
  ]);
  const previewItems = liveItems
    .filter((item) => item.purchasable && item.goldTotal >= 2200 && !item.tags.includes("Trinket") && !item.tags.includes("Consumable"))
    .slice(0, 6);

  return (
    <main className="min-h-screen bg-[#050914] text-[#f8fafc]">
      <RiftCommandBar />

      <section
        className="relative min-h-[92vh] overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: "url(https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Teemo_0.jpg)" }}
      >
        <div className="absolute inset-0 bg-[#050914]/78" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,9,20,.98),rgba(5,9,20,.72),rgba(5,9,20,.38))]" />
        <div className="relative mx-auto grid min-h-[92vh] max-w-7xl grid-cols-1 items-center gap-10 px-5 pt-24 lg:grid-cols-[1fr_34rem]">
          <div>
            <div className="font-display mb-4 inline-flex rounded-full border border-[#f5c542]/30 bg-[#f5c542]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#f5c542]">
              Daily League nonsense
            </div>
            <h1 className="font-display max-w-3xl text-4xl font-extrabold leading-[1.02] tracking-tight md:text-6xl">
              Suspiciously useful League homework.
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
              <LandingStat value={String(publicChampions.length)} label="Champions" />
              <LandingStat value={version} label="Patch" />
              <LandingStat value={String(liveItems.length)} label="Items" />
            </div>
          </div>

          <div className="hidden rounded-lg border border-white/12 bg-[#0a1020]/92 p-4 shadow-2xl lg:grid">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-display text-sm uppercase text-[#f5c542]">Verified Riot Catalog</div>
                <div className="text-2xl font-bold">Live Data Dragon {version}</div>
              </div>
              <Share2 className="text-[#38bdf8]" />
            </div>
            <div className="grid grid-cols-6 gap-2">
              {previewItems.map((item) => (
                <div key={item.id} className="grid min-h-20 place-items-center rounded-sm border border-white/10 bg-white/5 p-2" title={item.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt="" className="h-10 w-10 object-contain" />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md border border-white/10 bg-[#111827] p-3 text-sm text-[#cbd5e1]">
              {publicChampions.length} champions and {liveItems.length} Summoner&apos;s Rift items loaded from Riot Data Dragon.
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
          <div className="font-display mb-4 flex items-center gap-2 text-[#f5c542]"><Crown size={18} /> Verified Leaderboards</div>
          <p className="border-t border-white/8 py-4 text-sm leading-6 text-[#94a3b8]">
            Scores appear here only after authenticated Supabase users submit real attempts. No fabricated leaderboard rows are shown.
          </p>
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

function RiftCommandBar() {
  return (
    <header className="fixed left-0 right-0 top-0 z-30 border-b border-[#f5c542]/20 bg-[linear-gradient(180deg,rgba(10,15,28,.94),rgba(5,8,16,.86))] shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_18px_60px_rgba(0,0,0,.35),0_0_28px_rgba(246,199,74,.06)] backdrop-blur-xl after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-px after:bg-[linear-gradient(90deg,transparent,rgba(246,199,74,.2),rgba(56,189,248,.26),rgba(246,199,74,.2),transparent)]">
      <div className="mx-auto grid h-[4.75rem] w-[calc(100%_-_1.5rem)] max-w-[82.5rem] grid-cols-[1fr_auto] items-center gap-4 md:w-[calc(100%_-_3rem)] xl:grid-cols-[1fr_auto_1fr] xl:gap-7">
        <Link href="/" className="group inline-flex min-w-0 items-center gap-3 text-white">
          <span className="flex min-w-0 flex-col leading-none">
            <span className="font-display bg-gradient-to-r from-[#fff8cb] via-[#f6c74a] to-[#b8872b] bg-clip-text text-xl font-black uppercase tracking-[0.035em] text-transparent drop-shadow-[0_0_20px_rgba(245,197,66,.22)] sm:text-2xl">
              Rift Daily
            </span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.025))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_12px_32px_rgba(0,0,0,.22)] md:flex">
          <span className="mx-1 h-2 w-2 rotate-45 border border-[#f5c542]/35" />
          <LandingNavLink href="#leaderboard" label="Leaderboard" icon={<Trophy size={13} />} />
          <LandingNavLink href="#tech" label="Tech" icon={<Cpu size={13} />} />
          <LandingNavLink href="/suggest" label="Suggest" icon={<Sparkle size={13} />} />
          <span className="mx-1 h-2 w-2 rotate-45 border border-[#f5c542]/35" />
        </nav>

        <div className="justify-self-end flex items-center gap-2 sm:gap-3">
          <Link
            href="/play"
            className="font-display group/cta inline-flex min-h-11 items-center justify-center rounded-xl border border-[#ffe68c]/70 bg-[linear-gradient(180deg,#ffe27a_0%,#f6bd38_55%,#d99617_100%)] px-4 text-sm font-black text-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,.55),0_10px_28px_rgba(246,188,56,.28)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_14px_36px_rgba(246,188,56,.36)] sm:px-5"
          >
            Play Daily
            <ArrowRight size={16} className="ml-2 transition duration-200 group-hover/cta:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function LandingNavLink({ href, label, icon, active = false }: { href: string; label: string; icon: ReactNode; active?: boolean }) {
  const className = active
    ? "font-display inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#ffdf75,#f4bb35)] px-4 py-2.5 text-sm font-extrabold text-[#07101d] shadow-[inset_0_0_0_1px_rgba(255,238,164,.4),0_8px_22px_rgba(246,199,74,.2)]"
    : "font-display inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-extrabold text-[#dce6ff]/65 transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:text-white";

  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        <span className="text-[0.7rem] opacity-80">{icon}</span>
        {label}
      </Link>
    );
  }

  return (
    <a href={href} className={className}>
      <span className="text-[0.7rem] opacity-80">{icon}</span>
      {label}
    </a>
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
