import { Section, Eyebrow } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";

/**
 * "מה אומרים עלינו?" — an alternating strip of square cards: short films and
 * quotes from the field. Content slots are honest placeholders until the real
 * films and quotes arrive; the structure, motion and rhythm are final.
 */
export function Testimonials({ dict }: { dict: Dictionary }) {
  const t = dict.testimonials;

  return (
    <Section id="testimonials">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl" data-reveal>
          <Eyebrow>{t.kicker}</Eyebrow>
          <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
        </div>
      </div>

      <div
        role="region"
        aria-label={t.title}
        tabIndex={0}
        className="-mx-[var(--gutter)] mt-12 snap-x snap-mandatory overflow-x-auto scroll-px-[var(--gutter)] px-[var(--gutter)] pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-reveal
      >
        <ul className="flex w-max gap-5">
          {t.slots.map((slot, i) => (
            <li
              key={i}
              className="w-[min(78vw,21rem)] shrink-0 snap-start"
            >
              {slot.kind === "video" ? (
                <div className="group relative flex aspect-square flex-col justify-between overflow-hidden rounded-3xl bg-brand-950 p-6 shadow-soft">
                  <div aria-hidden className="aurora-techelet absolute inset-0 opacity-45" />
                  <div aria-hidden className="weave absolute inset-0 opacity-50" />
                  <span className="relative inline-flex w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {t.videoTag}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95 text-brand-800 shadow-lift transition-transform duration-300 ease-out-quart group-hover:scale-110">
                      <svg viewBox="0 0 24 24" className="ms-0.5 h-7 w-7" fill="currentColor">
                        <path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10.2-6.8a1 1 0 0 0 0-1.6L9.6 4.4c-.7-.5-1.6 0-1.6.8Z" />
                      </svg>
                    </span>
                  </span>
                  <div className="relative">
                    <h3 className="font-display text-xl font-bold text-white">{slot.title}</h3>
                    <p className="mt-1 text-sm text-brand-200">{t.soonVideo}</p>
                  </div>
                </div>
              ) : (
                <figure className="flex aspect-square flex-col justify-between rounded-3xl border border-line bg-surface p-6">
                  <svg viewBox="0 0 24 24" className="h-9 w-9 text-brand-300" fill="currentColor" aria-hidden="true">
                    <path d="M10.2 5.6C6.6 7.1 4.5 9.9 4.5 13.6c0 2.9 1.8 4.8 4.1 4.8 2 0 3.6-1.5 3.6-3.5 0-1.9-1.4-3.3-3.2-3.3-.3 0-.7 0-.8.1.3-1.9 1.9-3.9 3.7-4.8l-1.7-1.3Zm8.5 0c-3.6 1.5-5.7 4.3-5.7 8 0 2.9 1.8 4.8 4.1 4.8 2 0 3.6-1.5 3.6-3.5 0-1.9-1.4-3.3-3.2-3.3-.3 0-.6 0-.8.1.3-1.9 1.9-3.9 3.7-4.8l-1.7-1.3Z" />
                  </svg>
                  <blockquote className="text-lg font-medium leading-relaxed text-ink-500">
                    {t.soonQuote}
                  </blockquote>
                  <figcaption className="border-t border-line pt-4 text-sm font-semibold text-brand-700">
                    {slot.role}
                  </figcaption>
                </figure>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-sm text-ink-500">{t.note}</p>
    </Section>
  );
}
