import { Github, Linkedin, MessageSquare } from "lucide-react";
import Link from "next/link";

const creatorLinks = [
  { label: "GitHub", href: process.env.NEXT_PUBLIC_CREATOR_GITHUB_URL ?? "https://github.com/leots", icon: Github },
  { label: "LinkedIn", href: process.env.NEXT_PUBLIC_CREATOR_LINKEDIN_URL ?? "https://www.linkedin.com/in/leonardo-nguyen", icon: Linkedin }
];

export function CreatorFooter() {
  return (
    <footer className="bg-[#050914] px-5 pb-24 pt-14 text-[#f8fafc]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0a1020] p-5">
        <div className="flex flex-wrap gap-2">
          {creatorLinks.map(({ label, href, icon: Icon }) => (
            <a
              key={label}
              href={href}
              className="font-display inline-flex min-h-10 items-center gap-2 rounded-md border border-white/12 bg-white/[0.04] px-3 text-sm font-bold text-[#f8fafc] transition hover:border-[#f5c542] hover:text-[#f5c542]"
            >
              <Icon size={16} />
              {label}
            </a>
          ))}
        </div>
        <Link
          href="/suggest"
          className="font-display inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#f5c542] px-4 text-sm font-extrabold text-[#090b10] transition hover:bg-[#f8d86a]"
        >
          <MessageSquare size={16} />
          Suggestions
        </Link>
      </div>
      <p className="mx-auto mt-6 max-w-7xl text-xs text-[#64748b]">
        Rift Daily is a fan-made project and is not endorsed by Riot Games. League of Legends and related assets are
        property of Riot Games.
      </p>
    </footer>
  );
}
