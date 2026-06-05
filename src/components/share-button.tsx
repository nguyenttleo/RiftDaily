"use client";

import { Clipboard, Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ShareButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!text) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={copy}
      disabled={disabled}
      title="Copy share result"
      icon={copied ? <Check size={16} /> : <Clipboard size={16} />}
    >
      {copied ? "Copied" : "Share"}
    </Button>
  );
}
