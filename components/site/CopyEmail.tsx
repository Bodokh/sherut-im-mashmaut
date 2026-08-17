"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export function CopyEmail({
  email,
  copyLabel,
  copiedLabel,
  className,
}: {
  email: string;
  copyLabel: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1", className)}>
      <span dir="ltr" className="font-semibold text-brand-800">
        {email}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-full border border-brand-700/20 bg-white/70 px-3 py-1 text-sm font-semibold text-brand-800 transition-colors hover:border-brand-700/40 hover:bg-brand-50"
      >
        {copied ? copiedLabel : copyLabel}
      </button>
    </span>
  );
}
