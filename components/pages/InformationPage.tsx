import type { Graph } from "schema-dts";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui/Button";
import { Eyebrow, Section } from "@/components/ui/Section";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath, type SiteRouteKey } from "@/lib/routes";

type InformationPageCopy = Dictionary["lecturesPage"];

export function InformationPage({
  locale,
  dict,
  route,
  copy,
  graph,
  related,
}: {
  locale: Locale;
  dict: Dictionary;
  route: "lectures" | "guidance" | "getInvolved";
  copy: InformationPageCopy;
  graph: Graph;
  related: SiteRouteKey[];
}) {
  return (
    <>
      <Header locale={locale} currentRoute={route} copy={buildHeaderCopy(dict)} />
      <JsonLd data={graph} />
      <main id="main" className="pt-[var(--header-h)]">
        <Section className="overflow-hidden pb-16 sm:pb-20">
          <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <Breadcrumbs locale={locale} route={route} dict={dict} />
          <div className="max-w-3xl">
            <Eyebrow>{copy.kicker}</Eyebrow>
            <h1 className="mt-4 text-[clamp(2.25rem,4.5vw,4rem)] font-black leading-[1.05] text-ink-950">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-[64ch] text-lg leading-relaxed text-ink-700">{copy.lead}</p>
          </div>
        </Section>

        <Section tone="surface" className="py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:items-start">
            <div>
              <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold text-ink-950">{copy.answerTitle}</h2>
              <p className="mt-5 max-w-[68ch] text-lg leading-relaxed text-ink-700">{copy.answer}</p>
            </div>
            <aside className="rounded-3xl border border-brand-200 bg-paper p-6 shadow-soft sm:p-8">
              <h2 className="text-xl font-bold text-ink-950">{copy.highlightsTitle}</h2>
              <ul className="mt-5 space-y-3">
                {copy.highlights.map((item) => (
                  <li key={item} className="flex gap-3 text-ink-700">
                    <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>

          <div className="mt-16">
            <h2 className="sr-only">{copy.title}</h2>
            <ul className="grid gap-5 md:grid-cols-3">
              {copy.sections.map((item) => (
                <li key={item.title} className="rounded-3xl border border-line bg-paper p-6 shadow-soft sm:p-7">
                  <h3 className="text-2xl font-bold text-ink-950">{item.title}</h3>
                  <p className="mt-4 leading-relaxed text-ink-700">{item.text}</p>
                </li>
              ))}
            </ul>
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
          <RelatedLinks locale={locale} dict={dict} routes={related} />
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
