import { Section } from "@/components/ui/Section";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { donationLink } from "@/lib/contact";
import { localizedPath } from "@/lib/routes";
import styles from "./ProofAndGiving.module.css";

export function Donate({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.donate;

  return (
    <Section id="donate" tone="navy" className={styles.donate}>
      <svg viewBox="0 0 740 740" className={styles.givingPath} fill="none" aria-hidden="true">
        <path d="M710 48C530 48 540 204 410 260S232 274 240 430s103 217-98 278" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className={styles.donateLayout}>
        <div>
          <p className={styles.donateLabel}>{t.kicker}</p>
          <h2 className={styles.donateTitle}>{t.title}</h2>
        </div>
        <div className={styles.donateInvitation}>
          <p>{t.lead}</p>
          <a
            href={donationLink}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.donateCta}
          >
            {t.cta}
            <svg viewBox="0 0 24 24" className="h-5 w-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href={localizedPath(locale, "getInvolved")} className={styles.otherWays}>
            {t.otherWays}
          </a>
        </div>
      </div>
    </Section>
  );
}
