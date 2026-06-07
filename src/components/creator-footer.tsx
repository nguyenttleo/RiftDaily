import { Github, Linkedin, MessageCircle, MessageSquare } from "lucide-react";
import Link from "next/link";

const creatorLinks = [
  { label: "GitHub", href: process.env.NEXT_PUBLIC_CREATOR_GITHUB_URL ?? "https://github.com/leots", icon: Github },
  { label: "LinkedIn", href: process.env.NEXT_PUBLIC_CREATOR_LINKEDIN_URL ?? "https://www.linkedin.com/in/leonardo-nguyen", icon: Linkedin },
  { label: "Discord", href: process.env.NEXT_PUBLIC_CREATOR_DISCORD_URL ?? "https://discord.com/users/1eonardough", icon: MessageCircle }
];

export function CreatorFooter({ showSuggestions = true }: { showSuggestions?: boolean }) {
  return (
    <footer className="bg-[#050914] px-5 pb-24 pt-14 text-[#f8fafc]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 rounded-lg border border-white/10 bg-[#0a1020] p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-5">
        <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-3 sm:flex sm:flex-wrap">
          {creatorLinks.map(({ label, href, icon: Icon }) => (
            <a
              key={label}
              href={href}
              className="font-display inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-white/12 bg-white/[0.04] px-3 text-sm font-bold text-[#f8fafc] transition hover:border-[#f5c542] hover:text-[#f5c542]"
            >
              <Icon size={16} />
              {label}
            </a>
          ))}
        </div>
        {showSuggestions && (
          <Link
            href="/suggest"
            className="font-display inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#f5c542] px-4 text-sm font-extrabold text-[#090b10] transition hover:bg-[#f8d86a] sm:min-h-10"
          >
            <MessageSquare size={16} />
            Suggestions
          </Link>
        )}
      </div>
      <p className="mx-auto mt-6 max-w-7xl text-xs text-[#64748b]">
        Rift Daily is a fan-made project and is not endorsed by Riot Games. League of Legends and related assets are
        property of Riot Games.
      </p>
    </footer>
  );
}
