"use client";

import { Check, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import type { OptionItem } from "@/types";

interface SearchableSelectProps {
  label: string;
  placeholder: string;
  options: OptionItem[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SearchableSelect({ label, placeholder, options, value, onChange, disabled }: SearchableSelectProps) {
  const selected = options.find((option) => option.id === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimer = useRef<number | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return options;
    }

    return options
      .filter((option) => `${option.label} ${option.sublabel ?? ""}`.toLowerCase().includes(normalized));
  }, [options, query]);

  function choose(option: OptionItem) {
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
  }

  const syncDropdownPosition = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(180, Math.min(384, (openUp ? spaceAbove : spaceBelow) - gap));

    setDropdownRect({
      left: rect.left,
      width: rect.width,
      maxHeight,
      ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap })
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    syncDropdownPosition();
    window.addEventListener("resize", syncDropdownPosition);
    window.addEventListener("scroll", syncDropdownPosition, true);

    return () => {
      window.removeEventListener("resize", syncDropdownPosition);
      window.removeEventListener("scroll", syncDropdownPosition, true);
    };
  }, [open, query, syncDropdownPosition]);

  return (
    <label className="relative grid gap-2 text-sm text-[color:var(--muted)]">
      <span>{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]" size={16} />
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange("");
            setOpen(true);
            window.requestAnimationFrame(syncDropdownPosition);
          }}
          onFocus={() => {
            if (blurTimer.current) {
              window.clearTimeout(blurTimer.current);
            }
            setOpen(true);
            window.requestAnimationFrame(syncDropdownPosition);
          }}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 120);
          }}
          className="min-h-11 w-full rounded-lg border border-[color:var(--line)] bg-[var(--background-deep)] py-2 pl-9 pr-3 text-[color:var(--foreground)] outline-none transition focus:border-[var(--line-gold)] placeholder:text-[color:var(--muted)]"
        />
      </div>

      {open && !disabled && dropdownRect && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-[80] overflow-y-auto rounded-xl border border-[color:var(--line)] bg-[var(--panel-strong)] p-1.5 shadow-[var(--shadow-lg)] fine-scrollbar"
          style={{
            left: dropdownRect.left,
            width: dropdownRect.width,
            maxHeight: dropdownRect.maxHeight,
            ...(dropdownRect.top !== undefined ? { top: dropdownRect.top } : { bottom: dropdownRect.bottom })
          }}
        >
          {filtered.length > 0 ? (
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                className={cn(
                  "grid min-h-11 w-full grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-lg px-2 text-left text-sm transition hover:bg-white/[0.06]",
                  option.id === value && "bg-[rgba(243,198,77,.14)] text-[color:var(--gold)]"
                )}
              >
                {option.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.imageUrl} alt="" className="h-7 w-7 rounded object-cover" />
                ) : (
                  <span className="h-7 w-7 rounded bg-white/8" />
                )}
                <span>
                  <span className="block font-semibold text-[color:var(--foreground)]">{option.label}</span>
                  {option.sublabel && <span className="block text-xs text-[color:var(--muted)]">{option.sublabel}</span>}
                </span>
                {option.id === value && <Check size={15} />}
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-sm text-[color:var(--muted)]">No matches</div>
          )}
        </div>,
        document.body
      )}
    </label>
  );
}
