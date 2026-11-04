import Link from "next/link";
import Image from "next/image";
import { Section } from "@/components/ui/Section";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { organization } from "@/lib/organization";
import { localizedPath } from "@/lib/routes";
import { media } from "@/lib/media";
import styles from "./About.module.css";

function LinkArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function About({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.about;
  const org = dict.organization;
  const programPaths = [
    localizedPath(locale, "lectures"),
    localizedPath(locale, "guidance"),
    localizedPath(locale, "guidance"),
    "#contact",
  ];

  return (
    <Section id="about" className={styles.about}>
      <div className={styles.introduction}>
        <div className={styles.introCopy}>
          <p className={styles.sectionName}>{t.kicker}</p>
          <h2 className={styles.aboutTitle}>{t.title}</h2>
          <p className={styles.aboutLead}>{t.lead}</p>
        </div>

        <ul className={styles.lecturers} aria-label={dict.nav.team}>
          {dict.teamPage.members.slice(0, media.team.length).map((member, index) => (
            <li key={member.name}>
              <Link href={localizedPath(locale, "team")} className={styles.lecturer}>
                <span className={styles.portrait}>
                  <Image
                    src={media.team[index]}
                    alt=""
                    fill
                    sizes="(max-width: 767px) 90vw, 320px"
                    className={styles.lecturerImage}
                  />
                </span>
                <span className={styles.lecturerName}>{member.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.missionGrid}>
        <div className={styles.mission}>
          <h3>{t.missionTitle}</h3>
          <p>{t.mission}</p>
        </div>
        <ul className={styles.programs}>
          {t.programs.map((program, index) => (
            <li key={program}>
              <Link href={programPaths[index] ?? "#contact"}>
                <span>{program}</span>
                <LinkArrow />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.registration}>
        <p>
          <strong>{org.displayName}</strong>
          <span>{org.labels.registrationNumberShort} <bdi dir="ltr">{organization.registrationNumber}</bdi></span>
          <span>{org.address.city}</span>
        </p>
        <Link href={localizedPath(locale, "about")}>
          {org.detailsCta}
          <LinkArrow />
        </Link>
      </div>
    </Section>
  );
}
