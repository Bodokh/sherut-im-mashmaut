import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { PublicPageHero } from "@/components/pages/PublicPageHero";
import { JsonLd } from "@/components/seo/JsonLd";
import { Section } from "@/components/ui/Section";
import { ContactForm } from "@/components/forms/ContactForm";
import { PrivacyNotice } from "@/components/forms/PrivacyNotice";
import { SocialLinks } from "@/components/site/SocialLinks";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { communityLinks, contactLinks } from "@/lib/contact";
import { media } from "@/lib/media";
import { formatPostalAddress, organization } from "@/lib/organization";
import { localizedPath } from "@/lib/routes";
import { resolvePageMetadata } from "@/lib/seo";
import { contactPageGraph } from "@/lib/structured-data";
import styles from "./contact.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return resolvePageMetadata(locale, "contact");
}

function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </svg>
  );
}

function DetailRow({ label, value, href, external, ltr }: {
  label: string; value: string; href: string; external?: boolean; ltr?: boolean;
}) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>
        <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
          {ltr ? <bdi dir="ltr">{value}</bdi> : value}
        </a>
      </dd>
    </div>
  );
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const t = dict.contactPage;
  const d = dict.contact.details;

  return (
    <>
      <Header locale={locale} currentRoute="contact" copy={buildHeaderCopy(dict)} />
      <JsonLd data={contactPageGraph(locale, dict)} />
      <main id="main" className={styles.page}>
        <PublicPageHero locale={locale} route="contact" dict={dict} compact kicker={t.kicker} title={t.title} lead={t.lead}>
          <a href="#contact-form" className={styles.heroAction}>{t.formTitle}<Arrow /></a>
          <a href={contactLinks.whatsapp} target="_blank" rel="noopener noreferrer" className={styles.heroWhatsapp}>
            <WhatsAppIcon className={styles.icon} />{dict.contact.whatsappCta}
          </a>
        </PublicPageHero>

        <Section className={styles.workspace}>
          <div className={styles.layout}>
            <div id="contact-form" className={styles.formArea}>
              <h2>{t.formTitle}</h2>
              <p className={styles.disclaimer}>{dict.support.disclaimer}</p>
              <ContactForm locale={locale} form={dict.contact.form} privacyNotice={<PrivacyNotice locale={locale} id="contact-privacy-notice" />} />
            </div>

            <aside className={styles.directory} aria-labelledby="contact-directory-title">
              <div className={styles.photo}>
                <Image src={media.support} alt="" fill sizes="(max-width: 760px) 90vw, (max-width: 1100px) 38vw, 440px" className={styles.image} />
              </div>
              <h2 id="contact-directory-title">{t.detailsTitle}</h2>
              <dl className={styles.details}>
                <DetailRow label={d.emailLabel} value={d.email} href={`mailto:${d.email}`} ltr />
                <DetailRow label={d.whatsappLabel} value={dict.contact.whatsappCta} href={contactLinks.whatsapp} external />
                <DetailRow label={d.phoneLabel} value={d.phone} href={contactLinks.phone} ltr />
                <DetailRow label={dict.contact.hotlineCta} value={d.hotline} href={contactLinks.hotline} ltr />
                <div className={`${styles.detail} ${styles.wide}`}>
                  <dt>{dict.contact.groupsTitle}</dt>
                  <dd className={styles.groups}>
                    {([
                      [communityLinks.educators, dict.contact.groups.educators],
                      [communityLinks.parents, dict.contact.groups.parents],
                      [communityLinks.girlsBlog, dict.contact.groups.girlsBlog],
                    ] as const).map(([href, label]) => (
                      <a key={label} href={href} target="_blank" rel="noopener noreferrer">
                        <WhatsAppIcon className={styles.smallIcon} />{label}<Arrow />
                      </a>
                    ))}
                  </dd>
                </div>
                <div className={`${styles.detail} ${styles.wide}`}>
                  <dt>{dict.organization.labels.address}</dt>
                  <dd><address>{formatPostalAddress(dict.organization.address)}</address></dd>
                </div>
                <div className={styles.detail}>
                  <dt>{dict.organization.labels.registrationNumber}</dt>
                  <dd><bdi dir="ltr">{organization.registrationNumber}</bdi></dd>
                </div>
                <div className={styles.detail}>
                  <dt>{d.hoursLabel}</dt>
                  <dd>{d.hours}</dd>
                </div>
                <div className={`${styles.detail} ${styles.wide} ${styles.social}`}>
                  <dt>{dict.footer.followTitle}</dt>
                  <dd><SocialLinks labels={dict.footer.social} /></dd>
                </div>
              </dl>
              <Link href={localizedPath(locale, "about")} className={styles.organizationLink}>
                {dict.organization.detailsCta}<Arrow />
              </Link>
            </aside>
          </div>
        </Section>

        <Section className={styles.related}>
          <RelatedLinks locale={locale} dict={dict} routes={["lectures", "guidance", "faq", "getInvolved"]} />
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
