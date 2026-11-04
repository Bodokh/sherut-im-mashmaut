import { Section } from "@/components/ui/Section";
import { TestimonialsCarousel } from "@/components/sections/TestimonialsCarousel";
import type { Dictionary } from "@/i18n/dictionaries";
import styles from "./ProofAndGiving.module.css";

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
  const featured = t.items[9] ?? t.items[0];

  return (
    <Section id="testimonials" className={styles.testimonials}>
      <div className={styles.testimonialOpening}>
        <div className={styles.testimonialIntro}>
          <h2>{t.title}</h2>
          <p>{t.lead}</p>
        </div>
        {featured ? (
          <figure className={styles.featuredQuote}>
            <span className={styles.quotationMark} aria-hidden="true">“</span>
            <blockquote>{featured.quote}</blockquote>
            <figcaption>{caption(featured, t.fallbackCaption)}</figcaption>
          </figure>
        ) : null}
      </div>

      <TestimonialsCarousel label={t.title} prevLabel={t.prev} nextLabel={t.next}>
        <ul className={styles.quoteTrack}>
          {t.items.map((item, i) => (
            <li
              key={i}
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${t.items.length}`}
              className={styles.quoteSlide}
            >
              <figure className={styles.quote}>
                <blockquote>{item.quote}</blockquote>
                <figcaption>
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
