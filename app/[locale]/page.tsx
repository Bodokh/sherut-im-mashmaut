import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Manifesto } from "@/components/sections/Manifesto";
import { ReachMap } from "@/components/sections/ReachMap";
import { Support } from "@/components/sections/Support";
import { Donate } from "@/components/sections/Donate";
import { Contact } from "@/components/sections/Contact";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildPageMetadata } from "@/lib/seo";
import { homeGraph } from "@/lib/structured-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "he";
  return buildPageMetadata(safeLocale, "home", getDictionary(safeLocale));
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <>
      <Header locale={locale} currentRoute="home" copy={buildHeaderCopy(dict)} />
      <JsonLd data={homeGraph(locale, dict)} />
      <main id="main">
        <Hero locale={locale} dict={dict} />
        <About locale={locale} dict={dict} />
        <Manifesto dict={dict} />
        <ReachMap dict={dict} />
        <Support dict={dict} />
        <Donate locale={locale} dict={dict} />
        <Contact locale={locale} dict={dict} />
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
