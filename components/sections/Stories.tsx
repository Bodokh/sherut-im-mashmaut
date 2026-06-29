import { Section, Eyebrow } from "@/components/ui/Section";
import { StoryCard } from "@/components/ui/StoryCard";
import { media } from "@/lib/media";
import type { Dictionary } from "@/i18n/dictionaries";

export function Stories({ dict }: { dict: Dictionary }) {
  const t = dict.stories;

  return (
    <Section id="stories" tone="surface">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl" data-reveal>
          <Eyebrow>{t.kicker}</Eyebrow>
          <h2 className="mt-4 whitespace-pre-line text-[clamp(2rem,3.6vw,3.25rem)] font-bold leading-[1.05]">
            {t.title}
          </h2>
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

      <ul className="mt-12 grid gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
        {t.items.map((item, i) => (
          <li key={i} data-reveal style={{ ["--reveal-delay" as string]: `${i * 100}ms` }}>
            <StoryCard
              poster={media.stories[i % media.stories.length]}
              alt={item.title}
              tag={item.tag}
              title={item.title}
              excerpt={item.excerpt}
              duration={item.duration}
              soon={t.soon}
              contactLabel={dict.nav.contact}
              playLabel={dict.a11y.playFilm}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}
