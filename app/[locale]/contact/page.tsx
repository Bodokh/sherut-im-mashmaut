import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Section, Eyebrow } from "@/components/ui/Section";
import { ContactForm } from "@/components/forms/ContactForm";
import { contactLinks } from "@/lib/contact";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(isLocale(locale) ? locale : "he");
  return {
    title: t.contactPage.metaTitle,
    description: t.contactPage.metaDescription,
  };
}

function DetailRow({
  label,
  value,
  href,
  external,
  ltr,
}: {
  label: string;
  value: string;
  href: string;
  external?: boolean;
  ltr?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="block transition-colors hover:text-brand-700"
      >
        <dt className="text-sm font-semibold text-ink-500">{label}</dt>
        <dd className="mt-0.5 font-display text-lg font-bold text-ink-950" dir={ltr ? "ltr" : undefined}>
          {value}
        </dd>
      </a>
    </div>
  );
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const t = dict.contactPage;
  const d = dict.contact.details;
  const lines = t.title.split("\n");

  return (
    <>
      <Header locale={locale} copy={buildHeaderCopy(dict)} />
      <main id="main" className="pt-[var(--header-h)]">
        <Section className="overflow-hidden">
          <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <div className="max-w-2xl">
            <Eyebrow>{t.kicker}</Eyebrow>
            <h1 className="mt-4 text-[clamp(2.2rem,4.2vw,3.6rem)] font-black leading-[1.06]">
              <span className="block text-ink-950">{lines[0]}</span>
              {lines[1] ? <span className="block text-brand-700">{lines[1]}</span> : null}
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-700">{t.lead}</p>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <ContactForm form={dict.contact.form} email={d.email} />
            </div>

            <aside className="lg:col-span-5">
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <DetailRow label={d.emailLabel} value={d.email} href={contactLinks.email} ltr />
                <DetailRow
                  label={d.whatsappLabel}
                  value={dict.contact.whatsappCta}
                  href={contactLinks.whatsapp}
                  external
                />
                <DetailRow label={d.phoneLabel} value={d.phone} href={contactLinks.phone} ltr />
                <div className="rounded-2xl border border-line bg-surface p-4">
                  <dt className="text-sm font-semibold text-ink-500">{d.hoursLabel}</dt>
                  <dd className="mt-0.5 font-display text-lg font-bold text-ink-950">{d.hours}</dd>
                </div>
              </dl>
            </aside>
          </div>
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
