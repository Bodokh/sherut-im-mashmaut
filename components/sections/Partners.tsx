import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { localizedPath } from "@/lib/routes";
import type { Locale } from "@/i18n/config";
import type { Dictionary, Partner } from "@/i18n/dictionaries";

const PLACEHOLDER_SLOTS = 6;

const placeholderItemClass = "w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.5rem)] lg:w-[calc(16.666%-0.625rem)]";
const partnerItemClass = "w-full sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)]";

// Always light, whatever the surrounding theme: the logos' purple and navy text need a light backdrop.
const chipClass =
  "flex h-full min-h-24 w-full flex-col items-center justify-center gap-4 rounded-2xl border border-line bg-white px-5 py-6 text-center text-ink-800";

function PartnerCard({ partner, linkSuffix }: { partner: Partner; linkSuffix: string }) {
  const content = (
    <>
      {partner.logo ? (
        <span className="flex h-28 w-full items-center justify-center">
          <Image
            src={partner.logo}
            alt=""
            width={partner.logoWidth ?? 160}
            height={partner.logoHeight ?? 160}
            sizes="(min-width: 1024px) 160px, 40vw"
            className="h-28 w-auto max-w-full object-contain"
          />
        </span>
      ) : null}
      <span className="text-base font-semibold leading-snug text-balance">{partner.name}</span>
    </>
  );

  if (!partner.url) return <div className={chipClass}>{content}</div>;

  return (
    <a
      href={partner.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${partner.name} ${linkSuffix}`}
      className={`${chipClass} transition-colors hover:border-brand-300 hover:bg-brand-50`}
    >
      {content}
    </a>
  );
}

export function Partners({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.partners;
  const hasPartners = t.items.length > 0;

  return (
    <Section id="partners" tone="surface">
      <div className="mx-auto max-w-2xl text-center" data-reveal>
        <h2 className="text-[clamp(1.85rem,3.2vw,2.75rem)] font-bold text-balance">{t.title}</h2>
        <p className="mt-4 text-lg leading-relaxed text-ink-700">{t.lead}</p>
      </div>

      <ul
        className="mx-auto mt-12 flex max-w-5xl flex-wrap justify-center gap-3"
        data-reveal
        aria-label={t.title}
      >
        {hasPartners
          ? t.items.map((partner) => (
              <li key={partner.name} className={partnerItemClass}>
                <PartnerCard partner={partner} linkSuffix={t.linkSuffix} />
              </li>
            ))
          : Array.from({ length: PLACEHOLDER_SLOTS }, (_, i) => (
              <li
                key={i}
                className={`${placeholderItemClass} flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-paper px-4 text-center`}
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
        {hasPartners ? null : <p className="text-sm text-ink-500">{t.note}</p>}
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
