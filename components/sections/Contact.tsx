import Link from "next/link";
import { Section, Eyebrow } from "@/components/ui/Section";
import { contactLinks } from "@/lib/contact";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2.04c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.45 1.34 4.96L2 22l5.16-1.35a9.9 9.9 0 0 0 4.84 1.25h.01c5.49 0 9.95-4.46 9.95-9.96 0-2.66-1.03-5.16-2.91-7.04A9.9 9.9 0 0 0 12 2.04Zm4.71 13.42c-.26-.13-1.52-.75-1.75-.83-.24-.09-.41-.13-.58.13-.17.26-.67.83-.82 1-.15.17-.3.2-.56.07-.26-.13-1.08-.4-2.06-1.27-.76-.68-1.27-1.52-1.42-1.78-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.46.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.07-.13-.58-1.4-.79-1.92-.21-.5-.42-.43-.58-.44h-.5c-.17 0-.45.06-.68.32-.24.26-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.66.13.17 1.8 2.76 4.37 3.87.61.26 1.09.42 1.46.54.61.2 1.17.17 1.61.1.49-.07 1.52-.62 1.73-1.22.21-.6.21-1.1.15-1.22-.06-.11-.24-.18-.5-.31Z" />
    </svg>
  );
}

export function Contact({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.contact;
  const d = t.details;

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
            href={contactLinks.phone}
            className="inline-flex min-h-13 w-full items-center justify-center gap-2.5 rounded-full border border-brand-700/25 bg-white/40 px-7 text-base font-semibold text-brand-800 transition-colors hover:border-brand-700/40 hover:bg-brand-50 sm:w-auto"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M5 4.5C5 3.7 5.7 3 6.5 3h2.1c.7 0 1.3.5 1.5 1.2l.8 2.9a1.5 1.5 0 0 1-.6 1.6l-1.3 1a12.6 12.6 0 0 0 5.3 5.3l1-1.3a1.5 1.5 0 0 1 1.6-.6l2.9.8c.7.2 1.2.8 1.2 1.5v2.1c0 .8-.7 1.5-1.5 1.5H18C10.8 19 5 13.2 5 6V4.5Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              {t.callCta} · <span dir="ltr" className="tabular-nums">{d.phone}</span>
            </span>
          </a>
        </div>

        <p className="mt-6 text-ink-600" data-reveal>
          {t.orWrite}{" "}
          <a
            href={contactLinks.email}
            dir="ltr"
            className="font-semibold text-brand-700 underline-offset-4 transition-colors hover:text-brand-800 hover:underline"
          >
            {d.email}
          </a>
        </p>

        <div
          className="mx-auto mt-12 flex max-w-xl flex-col items-center justify-between gap-4 rounded-3xl border border-line bg-surface p-6 text-center sm:flex-row sm:text-start"
          data-reveal
        >
          <div>
            <h3 className="font-display text-lg font-bold text-ink-950">{t.inviteTitle}</h3>
            <p className="mt-1 text-[0.95rem] leading-relaxed text-ink-600">{t.inviteText}</p>
          </div>
          <Link
            href={`/${locale}/contact`}
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
