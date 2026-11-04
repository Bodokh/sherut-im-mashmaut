import { Section, Eyebrow } from "@/components/ui/Section";
import { TestimonialsCarousel } from "@/components/sections/TestimonialsCarousel";
import type { Dictionary } from "@/i18n/dictionaries";

type Caption = { name?: string; location?: string; caption?: string };

function caption({ name, location, caption: custom }: Caption, fallback: string) {
  return [name?.trim() || custom?.trim() || fallback, location?.trim()].filter(Boolean).join(", ");
}

/**
 * "מה אומרים עלינו?" — a snap-scroll carousel of quotes from participants.
 * Quotes live in `dict.testimonials.items`; add `name` / `location` there to
 * replace the neutral caption, or `caption` to override the default label.
 */
export function Testimonials({ dict }: { dict: Dictionary }) {
  const t = dict.testimonials;

  return (
    <Section id="testimonials">
      <div className="max-w-2xl" data-reveal>
        <Eyebrow>{t.kicker}</Eyebrow>
        <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
      </div>

      <TestimonialsCarousel label={t.title} prevLabel={t.prev} nextLabel={t.next}>
        <ul className="flex w-max gap-5">
          {t.items.map((item, i) => (
            <li
              key={i}
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${t.items.length}`}
              className="flex w-[min(78vw,21rem)] shrink-0 snap-start"
            >
              <figure className="flex min-h-72 w-full flex-col justify-between gap-6 rounded-3xl border border-line bg-surface p-6">
                <svg viewBox="0 0 24 24" className="h-9 w-9 shrink-0 text-brand-300" fill="currentColor" aria-hidden="true">
                  <path d="M10.2 5.6C6.6 7.1 4.5 9.9 4.5 13.6c0 2.9 1.8 4.8 4.1 4.8 2 0 3.6-1.5 3.6-3.5 0-1.9-1.4-3.3-3.2-3.3-.3 0-.7 0-.8.1.3-1.9 1.9-3.9 3.7-4.8l-1.7-1.3Zm8.5 0c-3.6 1.5-5.7 4.3-5.7 8 0 2.9 1.8 4.8 4.1 4.8 2 0 3.6-1.5 3.6-3.5 0-1.9-1.4-3.3-3.2-3.3-.3 0-.6 0-.8.1.3-1.9 1.9-3.9 3.7-4.8l-1.7-1.3Z" />
                </svg>
                <blockquote className="text-lg font-medium leading-relaxed text-ink-700">{item.quote}</blockquote>
                <figcaption className="border-t border-line pt-4 text-sm font-semibold text-brand-700">
                  {caption(item, t.fallbackCaption)}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </TestimonialsCarousel>
    </Section>
  );
}
