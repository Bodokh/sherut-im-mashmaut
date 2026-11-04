import type { Graph } from "schema-dts";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { PublicPageHero } from "@/components/pages/PublicPageHero";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { media } from "@/lib/media";
import { localizedPath, type SiteRouteKey } from "@/lib/routes";
import styles from "./InformationPage.module.css";

type InformationPageCopy = Dictionary["lecturesPage"];
type InformationRoute = "lectures" | "guidance" | "getInvolved";

function ProgramSymbol({ route, index }: { route: InformationRoute; index: number }) {
  const paths = {
    lectures: ["M5 6h22v15H15l-7 6v-6H5V6Zm6 6h10m-10 4h6", "m16 4 3.2 7 7.8.9-5.8 5.3 1.6 7.8-6.8-4-6.8 4 1.6-7.8L5 11.9l7.8-.9L16 4Z", "M5 9h22M9 5v8m14-8v8M7 9v18h18V9M12 18h8m-8 4h5"],
    guidance: ["M16 27S4 20.6 4 12.4A6.4 6.4 0 0 1 16 9a6.4 6.4 0 0 1 12 3.4C28 20.6 16 27 16 27Z", "M5 15 16 5l11 10M9 12v15h14V12M14 27v-8h4v8", "M16 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM7 27v-3a9 9 0 0 1 18 0v3M5 15a3 3 0 0 0 0 6m22-6a3 3 0 0 1 0 6"],
    getInvolved: ["M16 27S4 20.6 4 12.4A6.4 6.4 0 0 1 16 9a6.4 6.4 0 0 1 12 3.4C28 20.6 16 27 16 27Z", "m13 20-2 2a6 6 0 0 1-8-8l5-5a6 6 0 0 1 8 0m3 3 2-2a6 6 0 0 1 8 8l-5 5a6 6 0 0 1-8 0m-5-2 10-10", "M16 28V14m0 7C8 21 5 17 5 10c8 0 11 4 11 11Zm0-5c0-7 4-11 12-11 0 7-4 11-12 11Z"],
  } satisfies Record<InformationRoute, string[]>;
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[route][index] ?? paths[route][0]} /></svg>;
}

function PartnershipRoad() {
  return <svg className={styles.partnershipRoad} viewBox="0 0 1100 900" fill="none" aria-hidden="true">
    <path d="M536-30c-102 173 160 223 67 381-92 156-419 133-383 308 23 115 184 182 443 250-381-36-639-118-642-275-3-193 407-221 476-343 67-120-72-163 39-321Z" fill="#b8d0bc" />
    <path d="M583-30c-103 181 176 231 82 385-94 155-368 148-316 311 39 123 202 187 484 251-368-37-591-120-610-256-26-182 337-230 401-351 62-116-96-165-41-340Z" fill="#e3eef1" />
  </svg>;
}

export function InformationPage({ locale, dict, route, copy, graph, related }: {
  locale: Locale;
  dict: Dictionary;
  route: InformationRoute;
  copy: InformationPageCopy;
  graph: Graph;
  related: SiteRouteKey[];
}) {
  const image = route === "lectures" ? media.homeFilmPoster : route === "guidance" ? media.support : undefined;
  const routeClass = route === "guidance" ? styles.guidance : route === "getInvolved" ? styles.getInvolved : "";
  const contactHref = `${localizedPath(locale, "contact")}#contact-form`;

  return <>
    <Header locale={locale} currentRoute={route} copy={buildHeaderCopy(dict)} />
    <JsonLd data={graph} />
    <main id="main" className={`${styles.page} ${routeClass}`}>
      <div className={styles.opening}>
        {route === "getInvolved" ? <PartnershipRoad /> : null}
        <PublicPageHero locale={locale} route={route} dict={dict} kicker={copy.kicker} title={copy.title} lead={copy.lead} image={image} imagePosition={route === "guidance" ? "center 58%" : "center 38%"}>
          <Button href={contactHref} variant="white" size="lg" arrow>{copy.cta}</Button>
        </PublicPageHero>
      </div>

      <section className={styles.highlights} aria-labelledby="information-highlights-title">
        <div className={`shell ${styles.highlightsInner}`}>
          <h2 id="information-highlights-title">{copy.highlightsTitle}</h2>
          <ul>{copy.highlights.map((item) => <li key={item}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>{item}</span>
          </li>)}</ul>
        </div>
      </section>

      <Section className={styles.answer}>
        <div className={styles.answerOpening}>
          <h2>{copy.answerTitle}</h2>
          <p>{copy.answer}</p>
        </div>
        <ul className={styles.programs}>
          {copy.sections.map((item, index) => <li key={item.title}>
            <span className={styles.programSymbol}><ProgramSymbol route={route} index={index} /></span>
            <div><h3>{item.title}</h3><p>{item.text}</p></div>
          </li>)}
        </ul>
      </Section>

      <Section className={styles.processSection}>
        <h2 className={styles.sectionTitle}>{copy.processTitle}</h2>
        <ol className={styles.process}>
          {copy.process.map((item, index) => <li key={item.title}>
            <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </li>)}
        </ol>
      </Section>

      <Section className={styles.questions}>
        <div className={styles.questionLayout}>
          <h2 className={styles.sectionTitle}>{copy.faqTitle}</h2>
          <div className={styles.questionList}>
            {copy.faq.map((item) => <details key={item.question}>
              <summary><span>{item.question}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></summary>
              <p>{item.answer}</p>
            </details>)}
          </div>
        </div>
      </Section>

      <Section tone="navy" className={styles.invitation}>
        <div className={styles.invitationInner}>
          <h2>{copy.ctaTitle}</h2>
          <div><p>{copy.ctaText}</p>{route === "guidance" ? <p>{dict.support.disclaimer}</p> : null}<Button href={contactHref} variant="white" size="lg" arrow>{copy.cta}</Button></div>
        </div>
      </Section>

      <Section className={styles.related}><RelatedLinks locale={locale} dict={dict} routes={related} /></Section>
    </main>
    <Footer locale={locale} dict={dict} />
  </>;
}
