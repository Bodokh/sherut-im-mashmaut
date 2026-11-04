import Link from "next/link";
import { CopyEmail } from "@/components/site/CopyEmail";
import { SocialLinks } from "@/components/site/SocialLinks";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { Section } from "@/components/ui/Section";
import { communityLinks, contactLinks } from "@/lib/contact";
import { localizedPath } from "@/lib/routes";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import styles from "./Contact.module.css";

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M5 4.5C5 3.7 5.7 3 6.5 3h2.1c.7 0 1.3.5 1.5 1.2l.8 2.9a1.5 1.5 0 0 1-.6 1.6l-1.3 1a12.6 12.6 0 0 0 5.3 5.3l1-1.3a1.5 1.5 0 0 1 1.6-.6l2.9.8c.7.2 1.2.8 1.2 1.5v2.1c0 .8-.7 1.5-1.5 1.5H18C10.8 19 5 13.2 5 6V4.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Contact({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.contact;
  const d = t.details;
  const groups = [
    { href: communityLinks.educators, label: t.groups.educators },
    { href: communityLinks.parents, label: t.groups.parents },
    { href: communityLinks.girlsBlog, label: t.groups.girlsBlog },
  ];

  return (
    <Section id="contact" className={styles.contact}>
      <div className={styles.opening}>
        <div className={styles.intro}>
          <p className={styles.sectionName}>{t.kicker}</p>
          <h2>{t.title}</h2>
          <p className={styles.lead}>{t.lead}</p>
          <div className={styles.direct}>
            <a href={contactLinks.whatsapp} target="_blank" rel="noopener noreferrer" className={styles.whatsapp}>
              <WhatsAppIcon className={styles.icon} />
              {t.whatsappCta}
            </a>
            <a href={contactLinks.hotline} className={styles.hotline}>
              <PhoneIcon className={styles.icon} />
              <span>{t.hotlineCta}<bdi dir="ltr">{d.hotline}</bdi></span>
            </a>
          </div>
        </div>

        <div className={styles.invitation}>
          <h3>{t.inviteTitle}</h3>
          <p>{t.inviteText}</p>
          <Link
            href={localizedPath(locale, "contact")}
            className={styles.inviteCta}
          >
            <span>{t.inviteCta}</span>
            <span className={styles.arrowCircle} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </span>
          </Link>
        </div>
      </div>

      <div className={styles.connections}>
        <div className={styles.community}>
          <p className={styles.connectionLabel}>{t.groupsTitle}</p>
          <ul>
            {groups.map((group) => (
              <li key={group.label}>
                <a href={group.href} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className={styles.smallIcon} />
                  {group.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.email}>
          <p className={styles.connectionLabel}>{t.orWrite}</p>
          <CopyEmail email={d.email} copyLabel={t.copyEmail} copiedLabel={t.copiedEmail} className={styles.emailControl} />
        </div>
        <div className={styles.social}>
          <p className={styles.connectionLabel}>{dict.footer.followTitle}</p>
          <SocialLinks labels={dict.footer.social} className={styles.socialLinks} />
        </div>
      </div>
    </Section>
  );
}
