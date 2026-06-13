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
  compact = false,
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
  compact?: boolean;
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
        "relative z-30 border-b border-[var(--line)] bg-[rgba(7,9,14,.72)] backdrop-blur-xl after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-px after:bg-[linear-gradient(90deg,transparent,rgba(243,198,77,.22),transparent)]",
        position === "fixed" ? "fixed left-0 right-0 top-0" : "sticky top-0 rounded-2xl border-x border-t",
        !showCta && "w-full max-w-full",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto grid grid-cols-[1fr_auto] items-center gap-2",
          compact ? "min-h-12 py-1 md:min-h-14" : "min-h-[4.25rem] py-2 md:min-h-[4.75rem]",
          showCta
            ? "w-[calc(100%_-_1rem)] max-w-[82.5rem] md:w-[calc(100%_-_3rem)] xl:grid-cols-[minmax(9rem,1fr)_minmax(0,auto)_minmax(8rem,1fr)] xl:gap-4"
            : cn("w-full max-w-none xl:grid-cols-[auto_minmax(0,1fr)]", compact ? "px-2 sm:px-3 xl:gap-3" : "px-4 sm:px-5 xl:gap-5")
        )}
      >
        <Link
          href="/"
          className={cn(
            "group inline-flex w-fit min-w-0 max-w-max items-center gap-2.5 justify-self-start text-white transition-opacity hover:opacity-90",
            brandVariant === "substantial" ? "px-1 py-1" : ""
          )}
        >
          <span
            aria-hidden
            className={cn(
              "grid shrink-0 place-items-center rounded-xl border border-[var(--line-gold)] bg-[rgba(243,198,77,.1)] text-[var(--gold)]",
              brandVariant === "substantial" ? "h-9 w-9" : "h-8 w-8"
            )}
          >
            <Swords size={brandVariant === "substantial" ? 18 : 16} />
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span
              className={cn(
                "font-display bg-gradient-to-r from-[#fff4cf] via-[var(--gold)] to-[var(--gold-deep)] bg-clip-text font-black uppercase tracking-tight text-transparent",
                brandVariant === "substantial" ? "text-[1.55rem] sm:text-[1.85rem]" : "text-xl sm:text-2xl"
              )}
            >
              Rift Daily
            </span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className={cn(
            "order-3 col-span-2 min-w-0 max-w-full items-center overflow-x-auto rounded-full border border-[var(--line)] bg-[var(--surface-1)] fine-scrollbar xl:order-none xl:col-span-1",
            compact ? "p-1" : "p-1.5",
            showCta ? "flex gap-0.5" : cn("flex gap-1", compact ? "mx-1 sm:mx-2 xl:mx-3" : "mx-2 sm:mx-4 xl:mx-6")
          )}
        >
          {navItems.map((item) => (
            <CommandNavLink
              key={item.mode}
              href={hrefForMode(item.mode, activeProduct)}
              label={item.label}
              icon={item.icon}
              active={activeMode === item.mode}
              roomy={!showCta && !compact}
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
            <div className={cn("ml-auto inline-grid shrink-0 grid-cols-2 rounded-full border border-[var(--line)] bg-[var(--background-deep)]", compact ? "p-0.5" : "p-1")}>
              {(["lol", "tft"] as const).map((product) => (
                <button
                  key={product}
                  type="button"
                  aria-pressed={activeProduct === product}
                  onClick={() => onProductSelect?.(product)}
                  className={cn(
                    "font-display rounded-full text-xs font-extrabold uppercase transition sm:min-w-12",
                    compact ? "min-h-7 px-2.5" : "min-h-8 px-3",
                    activeProduct === product
                      ? "bg-[var(--gold)] text-[#14110a]"
                      : "text-[var(--muted)] hover:bg-white/[0.06] hover:text-white"
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
            className="btn-gold group/cta min-h-10 px-4 text-sm sm:min-h-11 sm:px-5"
          >
            Play Daily
            <ArrowRight size={16} className="transition duration-200 group-hover/cta:translate-x-0.5" />
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
          ? "bg-[var(--gold)] text-[#14110a] transition-none"
          : "bg-transparent text-[var(--muted)] shadow-none ring-0 transition-[color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white/[0.06] hover:text-white"
      )}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center overflow-visible opacity-80 [&_svg]:block [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:overflow-visible">
        {icon}
      </span>
      {label}
    </Link>
  );
}
