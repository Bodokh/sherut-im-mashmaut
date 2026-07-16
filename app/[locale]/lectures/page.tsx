import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InformationPage } from "@/components/pages/InformationPage";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/seo";
import { servicePageGraph } from "@/lib/structured-data";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "he";
  return buildPageMetadata(safeLocale, "lectures", getDictionary(safeLocale));
}

export default async function LecturesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <InformationPage
      locale={locale}
      dict={dict}
      route="lectures"
      copy={dict.lecturesPage}
      graph={servicePageGraph(locale, "lectures", dict)}
      related={["guidance", "team", "faq", "contact"]}
    />
  );
}
