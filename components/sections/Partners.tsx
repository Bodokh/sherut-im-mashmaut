import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { localizedPath } from "@/lib/routes";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

const SLOTS = 6;

export function Partners({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.partners;

  return (
    <Section id="partners" tone="surface">
      <div className="mx-auto max-w-2xl text-center" data-reveal>
        <h2 className="text-[clamp(1.85rem,3.2vw,2.75rem)] font-bold text-balance">{t.title}</h2>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{t.lead}</p>
      </div>

      <ul
        className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        data-reveal
        aria-label={t.note}
      >
        {Array.from({ length: SLOTS }, (_, i) => (
          <li
            key={i}
            className="flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-paper px-4 text-center"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink-300" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 8.6v6.8M8.6 12h6.8" strokeLinecap="round" />
            </svg>
            <span className="text-xs font-semibold text-ink-400">{t.slotLabel}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-ink-500">{t.note}</p>
        <Link
          href={localizedPath(locale, "contact")}
          className="group inline-flex items-center gap-1.5 font-semibold text-brand-700 transition-colors hover:text-brand-800"
        >
          {t.cta}
          <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </Section>
  );
}
