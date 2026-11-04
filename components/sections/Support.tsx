import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { communityLinks, contactLinks } from "@/lib/contact";
import { media } from "@/lib/media";
import type { Dictionary } from "@/i18n/dictionaries";
import styles from "./Support.module.css";

function SupportIcon({ index }: { index: number }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      {index === 0 ? (
        <>
          <path d="M7 9h26v18H20l-8 6v-6H7V9Z" strokeLinejoin="round" />
          <path d="M13 15h14M13 21h9" strokeLinecap="round" />
        </>
      ) : index === 1 ? (
        <>
          <path d="M8 18 20 8l12 10v15H8V18Z" strokeLinejoin="round" />
          <path d="M20 29s-7-4.4-7-8.3a3.6 3.6 0 0 1 7-1.1 3.6 3.6 0 0 1 7 1.1C27 24.6 20 29 20 29Z" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="20" cy="12" r="4.5" />
          <path d="M12 33v-6a8 8 0 0 1 16 0v6M6 14a4 4 0 0 1 4 4M30 18a4 4 0 0 1 4-4M5 33v-7a5 5 0 0 1 5-5M30 21a5 5 0 0 1 5 5v7" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function Support({ dict }: { dict: Dictionary }) {
  const t = dict.support;

  return (
    <Section id="support" className={styles.support}>
      <div className={styles.imageStage}>
        <Image
          src={media.support}
          alt={t.title}
          fill
          sizes="(max-width: 767px) 100vw, (max-width: 1400px) 90vw, 1280px"
          className={styles.photo}
        />
      </div>

      <div className={styles.invitation} data-theme="dark">
        <div className={styles.heading}>
          <p className={styles.kicker}>{t.kicker}</p>
          <h2>{t.title}</h2>
        </div>
        <div className={styles.invitationBody}>
          <p>{t.lead}</p>
          <div className={styles.actions}>
            <a href="#contact" className={styles.primary}>
              {t.cta}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a href={contactLinks.hotline} className={styles.hotline}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M5 4.5C5 3.7 5.7 3 6.5 3h2.1c.7 0 1.3.5 1.5 1.2l.8 2.9a1.5 1.5 0 0 1-.6 1.6l-1.3 1a12.6 12.6 0 0 0 5.3 5.3l1-1.3a1.5 1.5 0 0 1 1.6-.6l2.9.8c.7.2 1.2.8 1.2 1.5v2.1c0 .8-.7 1.5-1.5 1.5H18C10.8 19 5 13.2 5 6V4.5Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                <span>{t.hotlineCta}</span>
                <bdi dir="ltr">{dict.contact.details.hotline}</bdi>
              </span>
            </a>
          </div>

        </div>
      </div>

      <ul className={styles.programs}>
        {t.items.map((item, index) => (
          <li key={item.title}>
            <SupportIcon index={index} />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>

      <div className={styles.community}>
        <a href={communityLinks.girlsBlog} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon className="h-4 w-4" />
          {t.girlsBlogCta}
        </a>
      </div>
    </Section>
  );
}
