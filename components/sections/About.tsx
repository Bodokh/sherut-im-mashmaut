import Image from "next/image";
import Link from "next/link";
import { Section, Eyebrow } from "@/components/ui/Section";
import { media } from "@/lib/media";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

export function About({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.about;

  return (
    <Section id="about">
      <div className="max-w-3xl" data-reveal>
        <Eyebrow>{t.kicker}</Eyebrow>
        <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
      </div>

      <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {t.members.map((m, i) => (
          <li
            key={m.name}
            data-reveal
            style={{ ["--reveal-delay" as string]: `${i * 90}ms` }}
            className="group rounded-3xl border border-line bg-surface p-4 transition-all duration-300 ease-out-quart hover:-translate-y-1 hover:border-brand-300/60 hover:shadow-lift"
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-brand-100">
              <Image
                src={media.team[i]}
                alt={m.name}
                fill
                sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 300px"
                className="object-cover object-top transition-transform duration-700 ease-out-quart group-hover:scale-[1.04]"
              />
            </div>
            <div className="px-2 pb-1 pt-4">
              <h3 className="font-display text-xl font-bold text-ink-950">{m.name}</h3>
              <p className="mt-0.5 text-sm font-semibold text-brand-700">{m.role}</p>
              <p className="mt-2 line-clamp-4 text-[0.95rem] leading-relaxed text-ink-600">{m.bio}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Link
          href={`/${locale}/team`}
          className="group inline-flex items-center gap-1.5 font-semibold text-brand-700 transition-colors hover:text-brand-800"
        >
          {t.allTeam}
          <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </Section>
  );
}
