import Image from "next/image";
import { Section, Eyebrow } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { communityLinks, contactLinks } from "@/lib/contact";
import { media } from "@/lib/media";
import type { Dictionary } from "@/i18n/dictionaries";

export function Support({ dict }: { dict: Dictionary }) {
  const t = dict.support;

  return (
    <Section id="support">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Image */}
        <div className="relative" data-reveal="scale">
          <div className="relative aspect-[5/4] overflow-hidden rounded-[2rem] shadow-lift ring-1 ring-brand-950/5">
            <Image
              src={media.support}
              alt={t.title}
              fill
              sizes="(max-width: 1024px) 92vw, 540px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-brand-950/35 to-transparent" />
          </div>
          <div
            aria-hidden
            className="float-slow absolute -z-10 hidden h-40 w-40 rounded-full bg-green-300/40 blur-3xl lg:block"
            style={{ insetInlineEnd: "-2rem", bottom: "-2rem" }}
          />
        </div>

        {/* Content */}
        <div>
          <div data-reveal>
            <Eyebrow>{t.kicker}</Eyebrow>
            <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
          </div>

          <ul className="mt-8 space-y-5">
            {t.items.map((item, i) => (
              <li
                key={i}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 90}ms` }}
                className="flex gap-4"
              >
                <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-100 text-green-700">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold text-ink-950">{item.title}</h3>
                  <p className="mt-1 leading-relaxed text-ink-600">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-col items-start gap-3">
            <Button href="#contact" variant="give" size="lg" arrow>
              {t.cta}
            </Button>
            <a
              href={communityLinks.girlsBlog}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full border border-green-700/25 bg-white/40 px-6 text-base font-semibold text-green-800 transition-colors hover:border-green-700/40 hover:bg-green-50"
            >
              <WhatsAppIcon className="h-5 w-5" />
              {t.girlsBlogCta}
            </a>
            <a
              href={contactLinks.hotline}
              className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full border border-brand-700/25 bg-white/40 px-6 text-base font-semibold text-brand-800 transition-colors hover:border-brand-700/40 hover:bg-brand-50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                <path d="M5 4.5C5 3.7 5.7 3 6.5 3h2.1c.7 0 1.3.5 1.5 1.2l.8 2.9a1.5 1.5 0 0 1-.6 1.6l-1.3 1a12.6 12.6 0 0 0 5.3 5.3l1-1.3a1.5 1.5 0 0 1 1.6-.6l2.9.8c.7.2 1.2.8 1.2 1.5v2.1c0 .8-.7 1.5-1.5 1.5H18C10.8 19 5 13.2 5 6V4.5Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                {t.hotlineCta} · <span dir="ltr" className="tabular-nums">{dict.contact.details.hotline}</span>
              </span>
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}
