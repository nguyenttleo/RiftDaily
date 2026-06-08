"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlayMode, PlayProduct } from "@/components/rift-command-bar";

export function CopyLinkButton({
  mode,
  product = "lol",
  label = "Copy link",
  className
}: {
  mode: PlayMode;
  product?: PlayProduct;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const shareUrl = useMemo(() => modeShareUrl(mode, product), [mode, product]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyLink() {
    if (!shareUrl) {
      return;
    }

    setCopied(await copyText(shareUrl));
  }

  return (
    <Button
      type="button"
      variant="secondary"
      icon={copied ? <Check size={14} /> : <Copy size={14} />}
      onClick={() => void copyLink()}
      className={cn("min-h-9 px-2.5 text-xs sm:px-3", className)}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

function modeShareUrl(mode: PlayMode, product: PlayProduct) {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.origin);
  url.pathname = "/play";
  url.searchParams.set("mode", mode);

  if (product === "tft") {
    url.searchParams.set("game", "tft");
  }

  return url.toString();
}

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to an off-screen textarea below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}
