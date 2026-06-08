"use client";

import {
  ArrowRight,
  CircleSlash,
  Cpu,
  Grid2X2,
  Layers,
  MessageSquare,
  PackageSearch,
  Split,
  Swords,
  Trophy,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PlayProduct = "lol" | "tft";

export type PlayMode =
  | "item-build"
  | "item-recipe"
  | "guess-elo"
  | "champion-matchup"
  | "dodge-queue"
  | "leaderboard"
  | "tft-recipe"
  | "tft-connections";

const lolNavItems: Array<{ mode: PlayMode; label: string; icon: ReactNode }> = [
  { mode: "item-build", label: "Build", icon: <PackageSearch size={13} /> },
  { mode: "item-recipe", label: "Recipe", icon: <Split size={13} /> },
  { mode: "guess-elo", label: "ELO", icon: <UsersRound size={13} /> },
  { mode: "champion-matchup", label: "Matchup", icon: <Swords size={13} /> },
  { mode: "dodge-queue", label: "Lobby", icon: <CircleSlash size={13} /> },
  { mode: "leaderboard", label: "Leaderboard", icon: <Trophy size={13} /> }
];

const tftNavItems: Array<{ mode: PlayMode; label: string; icon: ReactNode }> = [
  { mode: "tft-recipe", label: "Recipe", icon: <Layers size={13} /> },
  { mode: "tft-connections", label: "Connections", icon: <Grid2X2 size={13} /> }
];

type BrandVariant = "substantial" | "sleek";

export function RiftCommandBar({
  activeMode,
  activeProduct = "lol",
  brandVariant = "substantial",
  includeGameLinks = true,
  includeInfoLinks = false,
  includeLeaderboardLink = false,
  homeAnchors = false,
  position = "fixed",
  showCta = true,
  showProductSwitch = false,
  className,
  onModeSelect,
  onProductSelect
}: {
  activeMode?: PlayMode;
  activeProduct?: PlayProduct;
  brandVariant?: BrandVariant;
  includeGameLinks?: boolean;
  includeInfoLinks?: boolean;
  includeLeaderboardLink?: boolean;
  homeAnchors?: boolean;
  position?: "fixed" | "sticky";
  showCta?: boolean;
  showProductSwitch?: boolean;
  className?: string;
  onModeSelect?: (mode: PlayMode) => void;
  onProductSelect?: (product: PlayProduct) => void;
}) {
  const productNavItems = activeProduct === "tft" ? tftNavItems : lolNavItems;
  const navItems = [
    ...(includeGameLinks ? productNavItems : []),
    ...(!includeGameLinks && includeLeaderboardLink ? lolNavItems.filter((item) => item.mode === "leaderboard") : [])
  ];

  return (
    <header
      className={cn(
        "relative z-30 border-b border-[#f5c542]/20 bg-[linear-gradient(180deg,rgba(10,15,28,.94),rgba(5,8,16,.86))] shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_18px_60px_rgba(0,0,0,.35),0_0_28px_rgba(246,199,74,.06)] backdrop-blur-xl after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-px after:bg-[linear-gradient(90deg,transparent,rgba(246,199,74,.2),rgba(56,189,248,.26),rgba(246,199,74,.2),transparent)]",
        position === "fixed" ? "fixed left-0 right-0 top-0" : "sticky top-0 rounded-xl border-x border-t",
        !showCta && "w-full max-w-full",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto grid min-h-[4.25rem] grid-cols-[1fr_auto] items-center gap-2 py-2 md:min-h-[4.75rem]",
          showCta
            ? "w-[calc(100%_-_1rem)] max-w-[82.5rem] md:w-[calc(100%_-_3rem)] xl:grid-cols-[minmax(9rem,1fr)_minmax(0,auto)_minmax(8rem,1fr)] xl:gap-4"
            : "w-full max-w-none px-4 sm:px-5 xl:grid-cols-[auto_minmax(0,1fr)] xl:gap-5"
        )}
      >
        <Link
          href="/"
          className={cn(
            "group inline-flex w-fit min-w-0 max-w-max justify-self-start text-white",
            brandVariant === "substantial"
              ? "rounded-2xl border border-[#f5c542]/20 bg-white/[0.035] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_10px_32px_rgba(0,0,0,.22)]"
              : "gap-2"
          )}
        >
          <span className="flex min-w-0 flex-col leading-none">
            <span
              className={cn(
                "font-display bg-gradient-to-r from-[#fff8cb] via-[#f6c74a] to-[#b8872b] bg-clip-text font-black uppercase text-transparent drop-shadow-[0_0_20px_rgba(245,197,66,.22)]",
                brandVariant === "substantial"
                  ? "text-[1.65rem] tracking-[0.055em] sm:text-[2rem]"
                  : "text-xl tracking-[0.025em] sm:text-2xl"
              )}
            >
              Rift Daily
            </span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className={cn(
            "order-3 col-span-2 min-w-0 max-w-full items-center overflow-x-auto rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.025))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_12px_32px_rgba(0,0,0,.22)] fine-scrollbar xl:order-none xl:col-span-1",
            showCta ? "flex gap-0.5" : "mx-2 flex gap-1 sm:mx-4 xl:mx-6"
          )}
        >
          {navItems.map((item) => (
            <CommandNavLink
              key={item.mode}
              href={hrefForMode(item.mode, activeProduct)}
              label={item.label}
              icon={item.icon}
              active={activeMode === item.mode}
              roomy={!showCta}
              onClick={(event) => {
                if (!onModeSelect) {
                  return;
                }

                event.preventDefault();
                onModeSelect(item.mode);
              }}
            />
          ))}
          {showProductSwitch && (
            <div className="ml-auto inline-grid shrink-0 grid-cols-2 rounded-full border border-[#c89b3c]/25 bg-[#050607]/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
              {(["lol", "tft"] as const).map((product) => (
                <button
                  key={product}
                  type="button"
                  aria-pressed={activeProduct === product}
                  onClick={() => onProductSelect?.(product)}
                  className={cn(
                    "font-display min-h-8 rounded-full px-3 text-xs font-extrabold uppercase transition sm:min-w-12",
                    activeProduct === product
                      ? "bg-[#f5c542] text-[#07101d] shadow-[0_8px_20px_rgba(245,197,66,.2)]"
                      : "text-[#dce6ff]/65 hover:bg-white/[0.07] hover:text-white"
                  )}
                >
                  {product === "lol" ? "LoL" : "TFT"}
                </button>
              ))}
            </div>
          )}
          {includeInfoLinks && (
            <>
              <CommandNavLink href={homeAnchors ? "#tech" : "/#tech"} label="Tech" icon={<Cpu size={13} />} roomy={!showCta || !includeGameLinks} />
              <CommandNavLink href="/suggest" label="Suggest" icon={<MessageSquare size={13} />} roomy={!showCta || !includeGameLinks} />
            </>
          )}
        </nav>

        {showCta && (
        <div className="justify-self-end">
          <Link
            href="/play?mode=item-build"
            onClick={(event) => {
              if (!onModeSelect) {
                return;
              }

              event.preventDefault();
              onModeSelect("item-build");
            }}
            className="font-display group/cta inline-flex min-h-10 items-center justify-center rounded-xl border border-[#ffe68c]/70 bg-[linear-gradient(180deg,#ffe27a_0%,#f6bd38_55%,#d99617_100%)] px-3 text-sm font-black text-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,.55),0_10px_28px_rgba(246,188,56,.28)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_14px_36px_rgba(246,188,56,.36)] sm:min-h-11 sm:px-5"
          >
            Play Daily
            <ArrowRight size={16} className="ml-2 transition duration-200 group-hover/cta:translate-x-0.5" />
          </Link>
        </div>
        )}
      </div>
    </header>
  );
}

function hrefForMode(mode: PlayMode, product: PlayProduct) {
  if (mode.startsWith("tft-") || product === "tft") {
    return `/play?game=tft&mode=${mode}`;
  }

  return `/play?mode=${mode}`;
}

function CommandNavLink({
  href,
  label,
  icon,
  active = false,
  roomy = false,
  onClick
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  roomy?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "font-display inline-flex items-center rounded-full font-extrabold outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5c542]/45",
        roomy ? "min-h-10 w-full justify-center gap-2 px-4 text-sm" : "min-h-9 shrink-0 gap-1.5 px-2.5 text-xs 2xl:min-h-10 2xl:gap-2 2xl:px-3 2xl:text-sm",
        active
          ? "bg-[linear-gradient(180deg,#ffdf75,#f4bb35)] text-[#07101d] shadow-[inset_0_0_0_1px_rgba(255,238,164,.4),0_8px_22px_rgba(246,199,74,.2)] transition-none"
          : "bg-transparent text-[#dce6ff]/65 shadow-none ring-0 transition-[color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white/[0.07] hover:text-white"
      )}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center overflow-visible opacity-80 [&_svg]:block [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:overflow-visible">
        {icon}
      </span>
      {label}
    </Link>
  );
}
