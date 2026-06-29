import { Section } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";

export function Field({ dict }: { dict: Dictionary }) {
  const t = dict.field;

  return (
    <Section id="field">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl" data-reveal>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500/70 motion-reduce:hidden" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
            {t.kicker}
          </span>
          <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold">{t.title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
        </div>
        <a
          href="#contact"
          data-reveal
          className="group inline-flex shrink-0 items-center gap-1.5 font-semibold text-brand-700 transition-colors hover:text-brand-800"
        >
          {t.cta}
          <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <ul className="mt-12 border-t border-line">
        {t.items.map((item, i) => (
          <li
            key={i}
            data-reveal
            style={{ ["--reveal-delay" as string]: `${i * 80}ms` }}
            className="group grid gap-2 border-b border-line py-7 transition-colors hover:bg-surface/60 sm:grid-cols-[10rem_1fr] sm:gap-8 sm:px-2"
          >
            <div className="flex flex-col">
              <span className="font-display text-lg font-bold text-brand-700">{item.date}</span>
              <span className="text-sm text-ink-500">{item.place}</span>
            </div>
            <div>
              <h3 className="font-display text-xl font-bold text-ink-950 transition-colors group-hover:text-brand-700">
                {item.title}
              </h3>
              <p className="mt-1.5 max-w-2xl leading-relaxed text-ink-600">{item.excerpt}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
