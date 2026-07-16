import Link from "next/link";
import { otherLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { localizedPath, type SiteRouteKey } from "@/lib/routes";

export function LangToggle({
  locale,
  label,
  a11yLabel,
  currentRoute,
  className,
}: {
  locale: Locale;
  label: string;
  a11yLabel: string;
  currentRoute: SiteRouteKey;
  className?: string;
}) {
  const target = otherLocale(locale);

  return (
    <Link
      href={localizedPath(target, currentRoute)}
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
