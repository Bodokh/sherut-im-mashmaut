import Link from "next/link";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { PublicPageHero } from "@/components/pages/PublicPageHero";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getLegalDictionary, LEGAL_UPDATED_DATE } from "@/i18n/legal";
import { contactLinks } from "@/lib/contact";
import { legalRouteKeys, localizedPath, type LegalRouteKey } from "@/lib/routes";
import { standardPageGraph } from "@/lib/structured-data";
import styles from "./LegalPage.module.css";

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
      <main id="main" className={styles.main}>
        <PublicPageHero locale={locale} route={route} dict={dict} title={dict.routeLabels[route]} lead={copy.lead} kicker={dict.brand.name} compact>
          <p className={styles.updated}>
            {legal.updatedLabel}{": "}<time dateTime={LEGAL_UPDATED_DATE}>{updated}</time>
          </p>
        </PublicPageHero>

        <div className={styles.readingArea}>
          <div className={`shell ${styles.layout}`}>
            <nav aria-labelledby="legal-contents-title" className={styles.contents}>
              <h2 id="legal-contents-title">{legal.contentsLabel}</h2>
              <ol>
                {copy.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.title}</a>
                  </li>
                ))}
                <li>
                  <a href="#contact-details">{copy.contactTitle}</a>
                </li>
              </ol>
            </nav>

            <article aria-label={dict.routeLabels[route]} className={styles.document}>
              {copy.sections.map((section) => (
                <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className={styles.documentSection}>
                  <h2 id={`${section.id}-title`}>{section.title}</h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.items ? (
                    <ul>
                      {section.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : null}
                </section>
              ))}

              <section id="contact-details" aria-labelledby="legal-contact-title" className={styles.contact}>
                <h2 id="legal-contact-title">{copy.contactTitle}</h2>
                <p>{copy.contactIntro}</p>
                <address>
                  <a href={emailHref} dir="ltr">{email}</a>
                  <p>{legal.phoneLabel}{": "}<a href={contactLinks.phone}><bdi dir="ltr">{dict.contact.details.phone}</bdi></a></p>
                </address>
                <Link href={localizedPath(locale, "contact")} className={styles.contactCta}>
                  {legal.contactLinkLabel}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
                </Link>
              </section>

              <nav aria-labelledby="legal-related-title" className={styles.related}>
                <h2 id="legal-related-title">{legal.relatedLabel}</h2>
                <ul>
                  {legalRouteKeys.filter((key) => key !== route).map((key) => (
                    <li key={key}><Link href={localizedPath(locale, key)}>{dict.routeLabels[key]}</Link></li>
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
