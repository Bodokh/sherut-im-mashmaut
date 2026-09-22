import Link from "next/link";
import { Section, Eyebrow } from "@/components/ui/Section";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { organization } from "@/lib/organization";
import { localizedPath } from "@/lib/routes";

export function About({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.about;
  const org = dict.organization;

  return (
    <Section id="about">
      <div className="grid gap-12 lg:grid-cols-12 lg:items-start lg:gap-16">
        <div className="lg:col-span-6" data-reveal="move">
          <Eyebrow>{t.kicker}</Eyebrow>
          <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
        </div>

        <div
          className="rounded-3xl border border-brand-200 bg-surface p-7 shadow-soft sm:p-9 lg:col-span-6"
          data-reveal
        >
          <h3 className="font-display text-2xl font-bold text-ink-950">{t.missionTitle}</h3>
          <p className="mt-3 leading-relaxed text-ink-700">{t.mission}</p>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {t.programs.map((program) => (
              <li key={program} className="flex items-center gap-2.5 font-semibold text-ink-800">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                {program}
              </li>
            ))}
          </ul>

          <div className="mt-6 border-t border-line pt-5 text-sm text-ink-600">
            <p>
              <span className="font-semibold text-ink-900">{org.displayName}</span>
              {" · "}
              {org.labels.registrationNumberShort} <bdi dir="ltr">{organization.registrationNumber}</bdi>
              {" · "}
              {org.address.city}
            </p>
            <Link
              href={localizedPath(locale, "about")}
              className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand-700 transition-colors hover:text-brand-900"
            >
              {org.detailsCta}
              <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
