import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { ORGANIZATION_DETAILS_TITLE_ID, OrganizationDetails } from "@/components/site/OrganizationDetails";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui/Button";
import { Eyebrow, Section } from "@/components/ui/Section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/lib/routes";
import { resolvePageMetadata } from "@/lib/seo";
import { aboutPageGraph } from "@/lib/structured-data";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return resolvePageMetadata(locale, "about");
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const copy = dict.aboutPage;

  return (
    <>
      <Header locale={locale} currentRoute="about" copy={buildHeaderCopy(dict)} />
      <JsonLd data={aboutPageGraph(locale, dict)} />
      <main id="main" className="pt-[var(--header-h)]">
        <Section className="overflow-hidden pb-16 sm:pb-20">
          <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <Breadcrumbs locale={locale} route="about" dict={dict} />
          <div className="max-w-3xl">
            <Eyebrow>{copy.kicker}</Eyebrow>
            <h1 className="mt-4 text-[clamp(2.25rem,4.5vw,4rem)] font-black leading-[1.05] text-ink-950">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-[64ch] text-lg leading-relaxed text-ink-700">{copy.lead}</p>
          </div>
        </Section>

        <Section tone="surface" className="py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)] lg:items-start">
            <div>
              <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold text-ink-950">{copy.missionTitle}</h2>
              <p className="mt-5 max-w-[68ch] text-lg leading-relaxed text-ink-700">{copy.mission}</p>

              <h2 className="mt-14 text-[clamp(1.75rem,3vw,2.5rem)] font-bold text-ink-950">{copy.programsTitle}</h2>
              <ul className="mt-6 grid gap-5 sm:grid-cols-2">
                {copy.programs.map((item) => (
                  <li key={item.title} className="rounded-3xl border border-line bg-paper p-6 shadow-soft">
                    <h3 className="text-xl font-bold text-ink-950">{item.title}</h3>
                    <p className="mt-3 leading-relaxed text-ink-700">{item.text}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-16 border-t border-line pt-14">
                <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold text-ink-950">{copy.purposesTitle}</h2>
                <p className="mt-4 max-w-[68ch] text-ink-600">{copy.purposesNote}</p>
                <ol className="mt-8 grid gap-4 lg:grid-cols-2">
                  {copy.purposes.map((purpose, index) => (
                    <li key={purpose} className="flex gap-4 rounded-3xl border border-line bg-paper p-5 shadow-soft sm:p-6">
                      <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">
                        {index + 1}
                      </span>
                      <p className="leading-relaxed text-ink-700">{purpose}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <aside aria-labelledby={ORGANIZATION_DETAILS_TITLE_ID} className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
              <OrganizationDetails
                locale={locale}
                dict={dict}
                title={copy.detailsTitle}
                certificateCta={copy.certificateCta}
                registryCta={copy.registryCta}
              />
            </aside>
          </div>

          <div className="mt-16 grid gap-10 border-t border-line pt-14 lg:grid-cols-2">
            <div>
              <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold text-ink-950">{copy.domainTitle}</h2>
              <p className="mt-5 max-w-[60ch] leading-relaxed text-ink-700">{copy.domainText}</p>
            </div>
            <div>
              <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold text-ink-950">{copy.leadershipTitle}</h2>
              <p className="mt-5 max-w-[60ch] leading-relaxed text-ink-700">{copy.leadershipText}</p>
              <Button href={localizedPath(locale, "team")} variant="outline" arrow className="mt-6">
                {copy.leadershipCta}
              </Button>
            </div>
          </div>
        </Section>

        <Section tone="navy" className="overflow-hidden py-16 sm:py-20">
          <div aria-hidden className="weave pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-[clamp(1.9rem,3.5vw,3rem)] font-bold text-white">{copy.ctaTitle}</h2>
            <p className="mt-4 text-lg leading-relaxed text-brand-100">{copy.ctaText}</p>
            <Button href={`${localizedPath(locale, "contact")}#contact-form`} variant="white" size="lg" arrow className="mt-8">
              {copy.cta}
            </Button>
          </div>
        </Section>

        <Section className="py-14 sm:py-16">
          <RelatedLinks locale={locale} dict={dict} routes={["team", "getInvolved", "faq", "contact"]} />
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
