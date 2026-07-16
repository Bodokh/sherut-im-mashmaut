import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InformationPage } from "@/components/pages/InformationPage";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/seo";
import { standardPageGraph } from "@/lib/structured-data";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "he";
  return buildPageMetadata(safeLocale, "getInvolved", getDictionary(safeLocale));
}

export default async function GetInvolvedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <InformationPage
      locale={locale}
      dict={dict}
      route="getInvolved"
      copy={dict.getInvolvedPage}
      graph={standardPageGraph(locale, "getInvolved", dict)}
      related={["lectures", "guidance", "team", "contact"]}
    />
  );
}
