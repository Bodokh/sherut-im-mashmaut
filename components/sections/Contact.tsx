import Link from "next/link";
import { CopyEmail } from "@/components/site/CopyEmail";
import { SocialLinks } from "@/components/site/SocialLinks";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { Section, Eyebrow } from "@/components/ui/Section";
import { communityLinks, contactLinks } from "@/lib/contact";
import { localizedPath } from "@/lib/routes";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M5 4.5C5 3.7 5.7 3 6.5 3h2.1c.7 0 1.3.5 1.5 1.2l.8 2.9a1.5 1.5 0 0 1-.6 1.6l-1.3 1a12.6 12.6 0 0 0 5.3 5.3l1-1.3a1.5 1.5 0 0 1 1.6-.6l2.9.8c.7.2 1.2.8 1.2 1.5v2.1c0 .8-.7 1.5-1.5 1.5H18C10.8 19 5 13.2 5 6V4.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Contact({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.contact;
  const d = t.details;
  const groups = [
    { href: communityLinks.educators, label: t.groups.educators },
    { href: communityLinks.parents, label: t.groups.parents },
    { href: communityLinks.girlsBlog, label: t.groups.girlsBlog },
  ];

  return (
    <Section id="contact">
      <div className="mx-auto max-w-2xl text-center" data-reveal>
        <Eyebrow className="justify-center">{t.kicker}</Eyebrow>
        <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" data-reveal>
          <a
            href={contactLinks.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-13 w-full items-center justify-center gap-2.5 rounded-full bg-green-700 px-7 text-base font-semibold text-white shadow-soft transition-all duration-200 ease-out-quart hover:bg-green-800 hover:shadow-lift active:scale-[0.98] sm:w-auto"
          >
            <WhatsAppIcon className="h-5 w-5" />
            {t.whatsappCta}
          </a>
          <a
            href={contactLinks.hotline}
            className="inline-flex min-h-13 w-full items-center justify-center gap-2.5 rounded-full border border-brand-700/25 bg-white/40 px-7 text-base font-semibold text-brand-800 transition-colors hover:border-brand-700/40 hover:bg-brand-50 sm:w-auto"
          >
            <PhoneIcon className="h-5 w-5" />
            <span>
              {t.hotlineCta} · <span dir="ltr" className="tabular-nums">{d.hotline}</span>
            </span>
          </a>
        </div>

        <div className="mt-10" data-reveal>
          <p className="text-sm font-semibold text-ink-500">{t.groupsTitle}</p>
          <div className="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row sm:flex-wrap">
            {groups.map((group) => (
              <a
                key={group.label}
                href={group.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-green-700/20 bg-green-50/70 px-5 text-sm font-semibold text-green-800 transition-colors hover:border-green-700/35 hover:bg-green-100 sm:w-auto"
              >
                <WhatsAppIcon className="h-4 w-4" />
                {group.label}
              </a>
            ))}
          </div>
        </div>

        <p className="mt-6 text-ink-600" data-reveal>
          {t.orWrite}{" "}
          <CopyEmail email={d.email} copyLabel={t.copyEmail} copiedLabel={t.copiedEmail} />
        </p>

        <div className="mt-8" data-reveal>
          <p className="mb-3 text-sm font-semibold text-ink-500">{dict.footer.followTitle}</p>
          <SocialLinks labels={dict.footer.social} className="justify-center" />
        </div>

        <div
          className="mx-auto mt-12 flex max-w-xl flex-col items-center justify-between gap-4 rounded-3xl border border-line bg-surface p-6 text-center sm:flex-row sm:text-start"
          data-reveal
        >
          <div>
            <h3 className="font-display text-lg font-bold text-ink-950">{t.inviteTitle}</h3>
            <p className="mt-1 text-[0.95rem] leading-relaxed text-ink-600">{t.inviteText}</p>
          </div>
          <Link
            href={localizedPath(locale, "contact")}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-700 px-6 font-semibold text-white shadow-soft transition-all duration-200 ease-out-quart hover:bg-brand-800 hover:shadow-lift"
          >
            {t.inviteCta}
            <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </Section>
  );
}
