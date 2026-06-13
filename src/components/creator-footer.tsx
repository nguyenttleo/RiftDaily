import { Github, Linkedin, MessageCircle, MessageSquare } from "lucide-react";
import Link from "next/link";

const creatorLinks = [
  { label: "GitHub", href: process.env.NEXT_PUBLIC_CREATOR_GITHUB_URL ?? "https://github.com/leots", icon: Github },
  { label: "LinkedIn", href: process.env.NEXT_PUBLIC_CREATOR_LINKEDIN_URL ?? "https://www.linkedin.com/in/leonardo-nguyen", icon: Linkedin },
  { label: "Discord", href: process.env.NEXT_PUBLIC_CREATOR_DISCORD_URL ?? "https://discord.com/users/1eonardough", icon: MessageCircle }
];

export function CreatorFooter({ showSuggestions = true }: { showSuggestions?: boolean }) {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--background)] px-6 pb-24 pt-14 text-[var(--foreground)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-md)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-5">
        <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-3 sm:flex sm:flex-wrap">
          {creatorLinks.map(({ label, href, icon: Icon }) => (
            <a
              key={label}
              href={href}
              className="btn-ghost min-h-10 whitespace-nowrap px-3.5 text-sm"
            >
              <Icon size={16} />
              {label}
            </a>
          ))}
        </div>
        {showSuggestions && (
          <Link
            href="/suggest"
            className="btn-gold min-h-11 px-4 text-sm sm:min-h-10"
          >
            <MessageSquare size={16} />
            Suggestions
          </Link>
        )}
      </div>
      <p className="mx-auto mt-6 max-w-7xl text-xs text-[var(--muted-soft)]">
        Rift Daily is a fan-made project and is not endorsed by Riot Games. League of Legends and related assets are
        property of Riot Games.
      </p>
    </footer>
  );
}
