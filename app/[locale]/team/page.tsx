import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { media } from "@/lib/media";
import { localizedPath } from "@/lib/routes";
import { resolvePageMetadata } from "@/lib/seo";
import { teamPageGraph } from "@/lib/structured-data";
import styles from "./team.module.css";

const BIO_LINK_CLASS =
  "font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 transition-colors hover:text-brand-900";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return resolvePageMetadata(locale, "team");
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const t = dict.teamPage;
  const [odelia, hillel, roi, eshed] = t.members;
  const eranCard = {
    name: t.eran.name,
    role: t.eran.role,
    bio: (
      <>
        {t.eran.bioExperience} {t.eran.bioBeforeDevShift}
        <a
          href="https://devshift.biz"
          target="_blank"
          rel="noreferrer"
          className={BIO_LINK_CLASS}
        >
          <bdi>{t.eran.devshiftName}</bdi>
        </a>
        {t.eran.bioBetweenCompanies}
        <a
          href="https://www.ai-crafters.com/"
          target="_blank"
          rel="noreferrer"
          className={BIO_LINK_CLASS}
        >
          <bdi>{t.eran.aiCraftersName}</bdi>
        </a>
        {t.eran.bioAfterCompanies}
      </>
    ),
  };
  const anonymous = (member: { anonymousAvatar?: boolean }) => Boolean(member.anonymousAvatar);
  const members = [
    {
      member: t.daniel,
      image: media.danielBodokh,
      anonymousAvatar: false,
      imagePosition: "center" as const,
    },
    {
      member: odelia,
      image: media.team[0],
      anonymousAvatar: false,
      imagePosition: "top" as const,
    },
    {
      member: hillel,
      image: null,
      anonymousAvatar: false,
      imagePosition: "top" as const,
    },
    {
      member: roi,
      image: null,
      anonymousAvatar: anonymous(roi),
      imagePosition: "top" as const,
    },
    {
      member: eranCard,
      image: media.eranBodokh,
      anonymousAvatar: false,
      imagePosition: "center" as const,
    },
    {
      member: t.talia,
      image: null,
      anonymousAvatar: false,
      imagePosition: "top" as const,
    },
    {
      member: eshed,
      image: null,
      anonymousAvatar: anonymous(eshed),
      imagePosition: "top" as const,
    },
  ];

  const portraitMembers = members
    .map((person, index) => ({ ...person, index }))
    .filter((person) => person.image);

  return (
    <>
      <Header locale={locale} currentRoute="team" copy={buildHeaderCopy(dict)} />
      <JsonLd data={teamPageGraph(locale, dict)} />
      <main id="main" className="pt-[var(--header-h)]">
        <section id="leadership" className={styles.hero} data-theme="dark">
          <div className={`shell ${styles.heroInner}`}>
            <div className={styles.breadcrumbs}>
              <Breadcrumbs locale={locale} route="team" dict={dict} />
            </div>
            <div className={styles.heroComposition}>
              <div className={styles.heroCopy}>
                <p className={styles.kicker}>{t.kicker}</p>
                <h1>{t.title}</h1>
                <p className={styles.lead}>{t.lead}</p>
              </div>
              <ul className={styles.portraitWall} aria-label={dict.routeLabels.team}>
                {portraitMembers.map(({ member, image, index }, portraitIndex) => (
                  <li key={member.name}>
                    <a href={`#team-member-${index + 1}`} className={styles.portraitLink}>
                      <span className={styles.heroPortrait}>
                        <Image
                          src={image!}
                          alt=""
                          fill
                          preload={portraitIndex === 0}
                          sizes="(max-width: 767px) 45vw, (max-width: 1100px) 16vw, 210px"
                          className={styles.portraitImage}
                        />
                      </span>
                      <span className={styles.portraitName}>{member.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <Section className={styles.profiles}>
          <ul className={styles.memberList}>
            {members.map(({ member: member, image, anonymousAvatar, imagePosition }, index) => (
              <li
                key={member.name}
                id={`team-member-${index + 1}`}
                className={`${styles.profile} ${image ? styles.photographed : styles.textProfile} ${anonymousAvatar ? styles.anonymous : ""} ${index === 1 ? styles.reversed : ""} ${index === 2 || index === 3 ? styles.paired : ""}`}
              >
                {image ? (
                  <div className={styles.profilePortrait}>
                    <Image
                      src={image}
                      alt={member.name}
                      fill
                      sizes="(max-width: 767px) 90vw, (max-width: 1100px) 38vw, 400px"
                      className={styles.profileImage}
                      style={{ objectPosition: imagePosition === "center" ? "50% 30%" : "top" }}
                    />
                  </div>
                ) : anonymousAvatar ? (
                  <svg viewBox="0 0 96 96" className={styles.anonymousMark} fill="none" aria-hidden="true">
                    <circle cx="48" cy="33" r="17" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M14 86c3-20 15-30 34-30s31 10 34 30" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                ) : null}
                <div className={styles.profileCopy}>
                  <h2>{member.name}</h2>
                  <p className={styles.role}>{member.role}</p>
                  <p className={styles.bio}>{member.bio}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.volunteers}>
            <p>{t.volunteersNote}</p>
          </div>
        </Section>

        <Section className={styles.invitation}>
          <div className={styles.invitationInner}>
            <div>
              <h2>{t.ctaTitle}</h2>
              <p>{t.ctaText}</p>
            </div>
            <Button href={localizedPath(locale, "contact")} size="lg" arrow>
              {t.cta}
            </Button>
          </div>
        </Section>

        <Section className="py-14 sm:py-16">
          <RelatedLinks locale={locale} dict={dict} routes={["lectures", "guidance", "getInvolved", "contact"]} />
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
