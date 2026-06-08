import { ArrowRight, BarChart3, ClipboardList, MessageSquare, Share2, Swords } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CreatorFooter } from "@/components/creator-footer";
import { HomeLeaderboardWidget } from "@/components/home-leaderboard-widget";
import { RiftCommandBar } from "@/components/rift-command-bar";
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
      <RiftCommandBar includeInfoLinks includeGameLinks={false} includeLeaderboardLink homeAnchors />

      <section
        className="relative min-h-[88dvh] overflow-hidden bg-cover bg-center"
        style={{ backgroundImage: "url(https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Teemo_0.jpg)" }}
      >
        <div className="absolute inset-0 bg-[#050914]/78" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,9,20,.98),rgba(5,9,20,.72),rgba(5,9,20,.38))]" />
        <div className="relative mx-auto grid min-h-[88dvh] max-w-7xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-36 lg:grid-cols-[1fr_34rem] xl:pt-24">
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
            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <Link href="/play?mode=item-build" className="font-display inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#f5c542] px-5 font-bold text-[#090b10]">
                Defeat your friends <ArrowRight size={18} />
              </Link>
              <Link href="/play?mode=leaderboard" className="font-display inline-flex min-h-12 items-center justify-center rounded-md border border-white/15 bg-white/6 px-5 font-bold text-white">
                Scout the leaderboard
              </Link>
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

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-14 md:grid-cols-3 md:py-20">
        <InfoCard icon={<ClipboardList />} title="Queue the chaos" text="Everyone gets the same puzzle set, so the excuses start immediately." />
        <InfoCard icon={<Swords />} title="Make the call" text="Choose builds, solve recipe trees, read cursed loading screens, and swap into TFT puzzles." />
        <InfoCard icon={<Share2 />} title="Send proof" text="Streaks, leaderboards, and shareable results make your victory annoying in the best way." />
      </section>

      <section id="leaderboard" className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[1fr_28rem] lg:py-20">
        <div>
          <SectionIntro eyebrow="Competition" title="Daily runs need rivals" />
          <p className="mt-4 max-w-2xl text-[#94a3b8]">
            Signed-in runs update the board through the same PostgreSQL leaderboard used inside the game dashboard.
          </p>
          <Link
            href="/play?mode=leaderboard"
            className="font-display mt-6 inline-flex min-h-11 items-center justify-center rounded-md border border-white/15 bg-white/6 px-4 font-bold text-white transition hover:-translate-y-0.5 hover:border-[#f5c542]/40 hover:bg-[#f5c542]/10"
          >
            View full leaderboard
          </Link>
        </div>
        <HomeLeaderboardWidget />
      </section>

      <section id="tech" className="border-y border-white/10 bg-[#0a1020] py-14 md:py-20">
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

      <section id="suggest" className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <div className="rounded-xl border border-white/10 bg-[#111827] p-5 sm:p-8">
          <MessageSquare className="mb-4 text-[#f5c542]" />
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Help shape Rift Daily</h2>
          <p className="mt-3 max-w-2xl text-[#94a3b8]">Send puzzle corrections, balance debates, game-mode ideas, UI feedback, or anything you want.</p>
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
