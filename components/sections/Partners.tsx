import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { localizedPath } from "@/lib/routes";
import type { Locale } from "@/i18n/config";
import type { Dictionary, Partner } from "@/i18n/dictionaries";
import styles from "./ProofAndGiving.module.css";

const PLACEHOLDER_SLOTS = 6;

function PartnerCard({ partner, linkSuffix }: { partner: Partner; linkSuffix: string }) {
  const content = (
    <>
      {partner.logo ? (
        <span className={styles.partnerLogo}>
          <Image
            src={partner.logo}
            alt=""
            width={partner.logoWidth ?? 160}
            height={partner.logoHeight ?? 160}
            sizes="(max-width: 640px) 25vw, 120px"
          />
        </span>
      ) : null}
      <span className={styles.partnerName}>{partner.name}</span>
    </>
  );

  if (!partner.url) return <div className={styles.partner}>{content}</div>;

  return (
    <a
      href={partner.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${partner.name} ${linkSuffix}`}
      className={`${styles.partner} ${styles.partnerLink}`}
    >
      {content}
    </a>
  );
}

export function Partners({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.partners;
  const hasPartners = t.items.length > 0;

  return (
    <Section id="partners" className={styles.partners}>
      <div className={styles.partnersLayout}>
        <div className={styles.partnersIntro}>
          <h2>{t.title}</h2>
          <p>{t.lead}</p>
          <Link href={localizedPath(locale, "contact")} className={styles.partnerCta}>
            {t.cta}
            <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
        <ul className={styles.partnerList} aria-label={t.title}>
          {hasPartners
            ? t.items.map((partner) => (
                <li key={partner.name}>
                  <PartnerCard partner={partner} linkSuffix={t.linkSuffix} />
                </li>
              ))
            : Array.from({ length: PLACEHOLDER_SLOTS }, (_, i) => (
                <li key={i} className={styles.partnerPlaceholder}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink-300" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 8.6v6.8M8.6 12h6.8" strokeLinecap="round" />
                  </svg>
                  <span className="text-xs font-semibold">{t.slotLabel}</span>
                </li>
              ))}
        </ul>
      </div>
      {hasPartners ? null : <p className={styles.partnerNote}>{t.note}</p>}
    </Section>
  );
}
