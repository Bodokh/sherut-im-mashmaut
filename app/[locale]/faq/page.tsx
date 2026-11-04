import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { PublicPageHero } from "@/components/pages/PublicPageHero";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { resolvePageMetadata } from "@/lib/seo";
import { localizedPath } from "@/lib/routes";
import { faqPageGraph } from "@/lib/structured-data";
import styles from "./faq.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return resolvePageMetadata(locale, "faq");
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const copy = dict.faqPage;

  return (
    <>
      <Header locale={locale} currentRoute="faq" copy={buildHeaderCopy(dict)} />
      <JsonLd data={faqPageGraph(locale, dict)} />
      <main id="main" className={`pt-[var(--header-h)] ${styles.page}`}>
        <PublicPageHero locale={locale} route="faq" dict={dict} title={copy.title} lead={copy.lead} kicker={copy.kicker} compact />

        <Section className={styles.questions} innerClassName={styles.questionLayout}>
          <aside className={styles.overview}>
            <svg className={styles.overviewPath} viewBox="0 0 320 440" fill="none" aria-hidden="true">
              <path d="M292-50c0 132-250 116-250 238s251 94 251 222" />
              <path d="M325-50c0 132-250 116-250 238s251 94 251 222" />
            </svg>
            <h2>{copy.answerTitle}</h2>
            <p>{copy.answer}</p>
          </aside>

          <div className={styles.accordion}>
            {copy.items.map((item, index) => (
              <details key={item.question} id={`faq-${index + 1}`} className={styles.question} open={index === 0}>
                <summary>
                  <h2>
                    <span>{item.question}</span>
                    <span className={styles.toggle} aria-hidden="true" />
                  </h2>
                </summary>
                <div className={styles.answer}><p>{item.answer}</p></div>
              </details>
            ))}
          </div>
        </Section>

        <Section tone="navy" className={styles.invitation} innerClassName={styles.invitationLayout}>
          <div>
            <h2>{copy.ctaTitle}</h2>
            <p>{copy.ctaText}</p>
          </div>
          <div className={styles.invitationAction}>
            <Button href={`${localizedPath(locale, "contact")}#contact-form`} variant="white" size="lg" arrow>
              {copy.cta}
            </Button>
          </div>
        </Section>

        <Section className={styles.related}>
          <RelatedLinks locale={locale} dict={dict} routes={["lectures", "guidance", "getInvolved", "contact"]} />
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
