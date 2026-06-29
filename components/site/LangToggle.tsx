"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { otherLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";

export function LangToggle({
  locale,
  label,
  a11yLabel,
  className,
}: {
  locale: Locale;
  label: string;
  a11yLabel: string;
  className?: string;
}) {
  const pathname = usePathname() || `/${locale}`;
  const target = otherLocale(locale);
  const segments = pathname.split("/");
  segments[1] = target;
  const href = segments.join("/") || `/${target}`;

  return (
    <Link
      href={href}
      hrefLang={target}
      aria-label={a11yLabel}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 opacity-70" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      {label}
    </Link>
  );
}
