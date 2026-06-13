import { ArrowRight, BarChart3, ClipboardList, MessageSquare, Sparkles, Swords } from "lucide-react";
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
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <RiftCommandBar includeInfoLinks includeGameLinks={false} includeLeaderboardLink homeAnchors />

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-50"
            style={{ backgroundImage: "url(https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Teemo_0.jpg)" }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_75%_15%,rgba(243,198,77,.10),transparent_55%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--background)_8%,rgba(7,9,14,.86)_42%,rgba(7,9,14,.35)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,14,.55),transparent_28%,transparent_60%,var(--background))]" />
        </div>

        <div className="mx-auto grid min-h-[86dvh] max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-16 pt-36 lg:grid-cols-[1.05fr_30rem] lg:pt-40 xl:pt-32">
          <div>
            <div className="chip">
              <Sparkles size={13} />
              Daily League nonsense
            </div>
            <h1 className="font-display mt-6 max-w-3xl text-[2.7rem] font-extrabold leading-[1.03] tracking-tight md:text-6xl lg:text-[4.1rem]">
              Suspiciously useful
              <span className="block bg-gradient-to-r from-[#fff4cf] via-[var(--gold)] to-[var(--gold-deep)] bg-clip-text text-transparent">
                League homework.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">
              Pick the build, judge the lobby, guess the doomed loading screen, and collect enough evidence to tell the
              group chat they were wrong &mdash; with confidence.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/play?mode=item-build" className="btn-gold min-h-12 px-6 text-sm">
                Defeat your friends
                <ArrowRight size={18} />
              </Link>
              <Link href="/play?mode=leaderboard" className="btn-ghost min-h-12 px-6 text-sm">
                Scout the leaderboard
              </Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
              <LandingStat value={String(publicChampions.length)} label="Champions" />
              <LandingStat value={version} label="Patch" />
              <LandingStat value={String(liveItems.length)} label="Items" />
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="surface hairline-top overflow-hidden p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="eyebrow">Verified Riot catalog</div>
                  <div className="font-display mt-1 text-xl font-bold">Live Data Dragon {version}</div>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-1)] text-[var(--teal)]">
                  <BarChart3 size={16} />
                </span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {previewItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid aspect-square place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-1)] p-2 transition hover:border-[var(--line-gold)]"
                    title={item.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt="" className="h-9 w-9 object-contain" />
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-1)] p-3 text-sm leading-relaxed text-[var(--muted)]">
                {publicChampions.length} champions and {liveItems.length} Summoner&apos;s Rift items, loaded straight from
                Riot Data Dragon.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto grid max-w-7xl gap-4 px-6 py-16 md:grid-cols-3 md:py-24">
        <InfoCard
          icon={<ClipboardList size={20} />}
          title="Queue the chaos"
          text="Everyone gets the same puzzle set, so the excuses start immediately."
        />
        <InfoCard
          icon={<Swords size={20} />}
          title="Make the call"
          text="Choose builds, solve recipe trees, read cursed loading screens, and swap into TFT puzzles."
        />
        <InfoCard
          icon={<Sparkles size={20} />}
          title="Send proof"
          text="Streaks, leaderboards, and shareable results make your victory annoying in the best way."
        />
      </section>

      {/* Leaderboard */}
      <section id="leaderboard" className="mx-auto grid max-w-7xl items-start gap-10 px-6 py-16 lg:grid-cols-[1fr_28rem] lg:py-24">
        <div>
          <SectionIntro eyebrow="Competition" title="Daily runs need rivals" />
          <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--muted)]">
            Signed-in runs update the board through the same PostgreSQL leaderboard used inside the game dashboard.
          </p>
          <Link href="/play?mode=leaderboard" className="btn-ghost mt-7 min-h-11 px-5 text-sm">
            View full leaderboard
            <ArrowRight size={16} />
          </Link>
        </div>
        <HomeLeaderboardWidget />
      </section>

      {/* Tech */}
      <section id="tech" className="border-y border-[var(--line)] bg-[var(--surface-1)] py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-6">
          <SectionIntro eyebrow="Architecture" title="A full-stack daily puzzle engine" />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {["Next.js", "TypeScript", "PostgreSQL", "AWS Amplify"].map((tech) => (
              <div
                key={tech}
                className="surface surface-hover flex items-center gap-3 p-5"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-1)] text-[var(--teal)]">
                  <BarChart3 size={18} />
                </span>
                <div className="font-display text-lg font-bold">{tech}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Suggest */}
      <section id="suggest" className="mx-auto max-w-7xl px-6 py-16 md:py-24">
        <div className="surface hairline-top relative overflow-hidden p-8 sm:p-12">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(243,198,77,.12),transparent_70%)]" />
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--line-gold)] bg-[rgba(243,198,77,.08)] text-[var(--gold)]">
            <MessageSquare size={20} />
          </span>
          <h2 className="font-display mt-5 text-3xl font-bold sm:text-4xl">Help shape Rift Daily</h2>
          <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            Send puzzle corrections, balance debates, game-mode ideas, UI feedback, or anything you want.
          </p>
          <Link href="/suggest" className="btn-gold mt-7 min-h-12 px-6 text-sm">
            Submit a suggestion
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <CreatorFooter />
    </main>
  );
}

function LandingStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="surface-flat p-4">
      <div className="font-display text-2xl font-bold tracking-tight text-[var(--foreground)]">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">{label}</div>
    </div>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="surface surface-hover p-7">
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--line-gold)] bg-[rgba(243,198,77,.08)] text-[var(--gold)]">
        {icon}
      </span>
      <div className="font-display mt-5 text-xl font-bold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p>
    </div>
  );
}

function SectionIntro({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="font-display mt-3 text-3xl font-extrabold tracking-tight md:text-5xl">{title}</h2>
    </div>
  );
}
