import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui/Button";
import { Eyebrow, Section } from "@/components/ui/Section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/seo";
import { faqPageGraph } from "@/lib/structured-data";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "he";
  return buildPageMetadata(safeLocale, "faq", getDictionary(safeLocale));
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const copy = dict.faqPage;

  return (
    <>
      <Header locale={locale} currentRoute="faq" copy={buildHeaderCopy(dict)} />
      <JsonLd data={faqPageGraph(locale, dict)} />
      <main id="main" className="pt-[var(--header-h)]">
        <Section className="overflow-hidden pb-16 sm:pb-20">
          <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <Breadcrumbs locale={locale} route="faq" dict={dict} />
          <div className="max-w-3xl">
            <Eyebrow>{copy.kicker}</Eyebrow>
            <h1 className="mt-4 text-[clamp(2.25rem,4.5vw,4rem)] font-black leading-[1.05] text-ink-950">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-[64ch] text-lg leading-relaxed text-ink-700">{copy.lead}</p>
          </div>
        </Section>

        <Section tone="surface" className="py-16 sm:py-20">
          <div className="max-w-3xl">
            <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold text-ink-950">{copy.answerTitle}</h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-700">{copy.answer}</p>
          </div>

          <div className="mt-14 max-w-4xl space-y-4">
            {copy.items.map((item) => (
              <section key={item.question} className="rounded-3xl border border-line bg-paper p-6 shadow-soft sm:p-8">
                <h2 className="text-xl font-bold leading-snug text-ink-950 sm:text-2xl">{item.question}</h2>
                <p className="mt-4 leading-relaxed text-ink-700">{item.answer}</p>
              </section>
            ))}
          </div>
        </Section>

        <Section tone="navy" className="overflow-hidden py-16 sm:py-20">
          <div aria-hidden className="weave pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-[clamp(1.9rem,3.5vw,3rem)] font-bold text-white">{copy.ctaTitle}</h2>
            <p className="mt-4 text-lg leading-relaxed text-brand-100">{copy.ctaText}</p>
            <Button href={`/${locale}/contact#contact-form`} variant="white" size="lg" arrow className="mt-8">
              {copy.cta}
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
