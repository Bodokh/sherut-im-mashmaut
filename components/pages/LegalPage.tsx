import Link from "next/link";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { Eyebrow, Section } from "@/components/ui/Section";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getLegalDictionary, LEGAL_UPDATED_DATE } from "@/i18n/legal";
import { contactLinks } from "@/lib/contact";
import { legalRouteKeys, localizedPath, type LegalRouteKey } from "@/lib/routes";
import { standardPageGraph } from "@/lib/structured-data";

const linkClass = "rounded-sm font-semibold text-brand-800 underline decoration-brand-300 underline-offset-4 hover:text-brand-950";

export function LegalPage({ locale, route }: { locale: Locale; route: LegalRouteKey }) {
  const dict = getDictionary(locale);
  const legal = getLegalDictionary(locale);
  const copy = legal.pages[route];
  const email = route === "privacy" ? contactLinks.privacyEmailAddress : contactLinks.emailAddress;
  const emailHref = route === "privacy" ? contactLinks.privacyEmail : contactLinks.email;
  const updated = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${LEGAL_UPDATED_DATE}T00:00:00Z`));

  return (
    <>
      <Header locale={locale} currentRoute={route} copy={buildHeaderCopy(dict)} />
      <JsonLd data={standardPageGraph(locale, route, dict)} />
      <main id="main" className="pt-[var(--header-h)]">
        <Section className="overflow-hidden pb-12 sm:pb-16">
          <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <Breadcrumbs locale={locale} route={route} dict={dict} />
          <div className="max-w-3xl">
            <Eyebrow>{dict.brand.name}</Eyebrow>
            <h1 className="mt-4 text-[clamp(2.25rem,4.5vw,4rem)] font-black leading-tight text-ink-950">
              {dict.routeLabels[route]}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-ink-700">{copy.lead}</p>
            <p className="mt-5 text-sm text-ink-600">
              {legal.updatedLabel}{": "}<time dateTime={LEGAL_UPDATED_DATE}>{updated}</time>
            </p>
          </div>
        </Section>

        <div className="bg-surface py-12 sm:py-16">
          <div className="shell grid items-start gap-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-16">
            <nav aria-labelledby="legal-contents-title" className="rounded-3xl border border-line bg-paper p-6 lg:sticky lg:top-28">
              <h2 id="legal-contents-title" className="text-lg font-bold text-ink-950">{legal.contentsLabel}</h2>
              <ol className="mt-4 space-y-1">
                {copy.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="block rounded-lg px-2 py-2 text-sm leading-relaxed text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-900">
                      {section.title}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="#contact-details" className="block rounded-lg px-2 py-2 text-sm leading-relaxed text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-900">
                    {copy.contactTitle}
                  </a>
                </li>
              </ol>
            </nav>

            <article aria-label={dict.routeLabels[route]} className="min-w-0 max-w-3xl space-y-12 text-ink-700">
              {copy.sections.map((section) => (
                <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-28">
                  <h2 id={`${section.id}-title`} className="text-2xl font-bold leading-snug text-ink-950">{section.title}</h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="mt-4 leading-8 [overflow-wrap:anywhere]">{paragraph}</p>
                  ))}
                  {section.items ? (
                    <ul className="mt-4 list-disc space-y-3 ps-6 leading-8">
                      {section.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : null}
                </section>
              ))}

              <section id="contact-details" aria-labelledby="legal-contact-title" className="scroll-mt-28 rounded-3xl border border-brand-200 bg-paper p-6 sm:p-8">
                <h2 id="legal-contact-title" className="text-2xl font-bold text-ink-950">{copy.contactTitle}</h2>
                <p className="mt-4 leading-8">{copy.contactIntro}</p>
                <address className="mt-5 flex flex-col items-start gap-3 not-italic">
                  <a href={emailHref} dir="ltr" className={`${linkClass} break-all`}>{email}</a>
                  <p>{legal.phoneLabel}{": "}<a href={contactLinks.phone} className={linkClass}><bdi dir="ltr">{dict.contact.details.phone}</bdi></a></p>
                </address>
                <Link href={localizedPath(locale, "contact")} className={`${linkClass} mt-5 inline-block`}>{legal.contactLinkLabel}</Link>
              </section>

              <nav aria-labelledby="legal-related-title" className="border-t border-line pt-8">
                <h2 id="legal-related-title" className="text-lg font-bold text-ink-950">{legal.relatedLabel}</h2>
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                  {legalRouteKeys.filter((key) => key !== route).map((key) => (
                    <li key={key}><Link href={localizedPath(locale, key)} className={linkClass}>{dict.routeLabels[key]}</Link></li>
                  ))}
                </ul>
              </nav>
            </article>
          </div>
        </div>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
