"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function Button({ className, variant = "primary", icon, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "font-display inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "border-[color:var(--gold)] bg-[color:var(--gold)] text-[#11141c] hover:bg-[color:var(--gold-bright)]",
        variant === "secondary" &&
          "border-[color:var(--line)] bg-white/7 text-[color:var(--foreground)] hover:border-[color:var(--gold)] hover:bg-white/10",
        variant === "ghost" &&
          "border-transparent bg-transparent text-[color:var(--muted)] hover:bg-white/7 hover:text-[color:var(--foreground)]",
        variant === "danger" && "border-red-400/30 bg-red-500/15 text-red-100 hover:bg-red-500/25",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
