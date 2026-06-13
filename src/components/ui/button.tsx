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
        "font-display inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "border-[color:var(--gold)] bg-[color:var(--gold)] text-[#14110a] hover:-translate-y-px hover:brightness-105",
        variant === "secondary" &&
          "border-[color:var(--line-strong)] bg-[color:var(--surface-1)] text-[color:var(--foreground)] hover:border-[color:var(--line-gold)] hover:bg-[color:var(--surface-2)]",
        variant === "ghost" &&
          "border-transparent bg-transparent text-[color:var(--muted)] hover:bg-white/6 hover:text-[color:var(--foreground)]",
        variant === "danger" && "border-[rgba(224,98,108,.35)] bg-[rgba(224,98,108,.14)] text-[#ffd2d6] hover:bg-[rgba(224,98,108,.22)]",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
