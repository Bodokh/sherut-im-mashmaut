import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { ORGANIZATION_DETAILS_TITLE_ID, OrganizationDetails } from "@/components/site/OrganizationDetails";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/lib/routes";
import { media } from "@/lib/media";
import { resolvePageMetadata } from "@/lib/seo";
import { aboutPageGraph } from "@/lib/structured-data";
import styles from "./about.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return resolvePageMetadata(locale, "about");
}

function ProgramSymbol({ index }: { index: number }) {
  const paths = [
    <path key="talk" d="M6 5h24v16H18l-7 6v-6H6V5Zm6 6h12m-12 5h8" />,
    <path key="guidance" d="m24 8-5 12-11 5 5-12 11-5Zm-8 8h.01M16 2v3m0 24v3M2 17h3m24 0h3" />,
    <path key="family" d="M6 28V15l10-8 10 8v13M12 28v-8h8v8M2 16l14-11 14 11" />,
    <path key="community" d="M11 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm14 0a4 4 0 1 0 0-8M2 29v-4a9 9 0 0 1 18 0v4m5-9a7 7 0 0 1 7 7v2" />,
  ];
  return <svg viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[index]}</svg>;
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const copy = dict.aboutPage;
  const programPaths = [
    localizedPath(locale, "lectures"),
    localizedPath(locale, "guidance"),
    localizedPath(locale, "guidance"),
    `${localizedPath(locale, "home")}#contact`,
  ];

  return (
    <>
      <Header locale={locale} currentRoute="about" copy={buildHeaderCopy(dict)} />
      <JsonLd data={aboutPageGraph(locale, dict)} />
      <main id="main" className={`pt-[var(--header-h)] ${styles.page}`}>
        <section className={styles.hero} data-theme="dark">
          <div className={`shell ${styles.heroInner}`}>
            <div className={styles.breadcrumbs}><Breadcrumbs locale={locale} route="about" dict={dict} /></div>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <p className={styles.kicker}>{copy.kicker}</p>
                <h1>{copy.title}</h1>
                <p className={styles.lead}>{copy.lead}</p>
              </div>
              <ul className={styles.portraits} aria-label={dict.nav.team}>
                {dict.teamPage.members.slice(0, media.team.length).map((member, index) => (
                  <li key={member.name}>
                    <Link href={localizedPath(locale, "team")} className={styles.person}>
                      <span className={styles.portrait}>
                        <Image src={media.team[index]} alt="" fill preload={index === 0}
                          sizes="(max-width: 760px) 90vw, 352px"
                          className={styles.portraitImage} />
                      </span>
                      <span className={styles.personName}>{member.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <Section className={styles.mission}>
          <div className={styles.missionGrid}>
            <h2>{copy.missionTitle}</h2>
            <p>{copy.mission}</p>
          </div>
        </Section>

        <Section className={styles.programSection}>
          <div className={styles.programOpening}><h2>{copy.programsTitle}</h2></div>
          <ul className={styles.programs}>
            {copy.programs.map((item, index) => (
              <li key={item.title}>
                <ProgramSymbol index={index} />
                <div>
                  <h3><Link href={programPaths[index] ?? localizedPath(locale, "contact")}>{item.title}</Link></h3>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section className={styles.official}>
          <div className={styles.officialOpening}>
            <h2>{copy.purposesTitle}</h2>
            <p>{copy.purposesNote}</p>
          </div>
          <div className={styles.officialGrid}>
            <ol className={styles.purposes}>
              {copy.purposes.map((purpose) => <li key={purpose}><p>{purpose}</p></li>)}
            </ol>
            <aside aria-labelledby={ORGANIZATION_DETAILS_TITLE_ID} className={styles.details}>
              <OrganizationDetails locale={locale} dict={dict} title={copy.detailsTitle}
                certificateCta={copy.certificateCta} registryCta={copy.registryCta} />
            </aside>
          </div>
        </Section>

        <Section className={styles.identity}>
          <div className={styles.identityGrid}>
            <div className={styles.leadership}>
              <h2>{copy.leadershipTitle}</h2>
              <p>{copy.leadershipText}</p>
              <Button href={localizedPath(locale, "team")} variant="primary" arrow className={styles.teamCta}>{copy.leadershipCta}</Button>
            </div>
            <div className={styles.domain}>
              <h2>{copy.domainTitle}</h2>
              <p>{copy.domainText}</p>
            </div>
          </div>
        </Section>

        <Section tone="navy" className={styles.invitation}>
          <div className={styles.invitationGrid}>
            <h2>{copy.ctaTitle}</h2>
            <div>
              <p>{copy.ctaText}</p>
              <Button href={`${localizedPath(locale, "contact")}#contact-form`} variant="white" size="lg" arrow className={styles.contactCta}>{copy.cta}</Button>
            </div>
          </div>
        </Section>

        <Section className={styles.related}>
          <RelatedLinks locale={locale} dict={dict} routes={["team", "getInvolved", "faq", "contact"]} />
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
