import { Section } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";

export function Partners({ dict }: { dict: Dictionary }) {
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
      >
        {t.logos.map((logo, i) => (
          <li
            key={i}
            className="flex h-24 items-center justify-center rounded-2xl border border-line bg-paper px-4 text-center transition-colors hover:border-brand-300/60"
          >
            <span className="font-display text-base font-bold leading-tight text-ink-500">{logo}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-ink-500">{t.note}</p>
        <a
          href="#contact"
          className="group inline-flex items-center gap-1.5 font-semibold text-brand-700 transition-colors hover:text-brand-800"
        >
          {t.cta}
          <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </Section>
  );
}
