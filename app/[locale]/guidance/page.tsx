import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InformationPage } from "@/components/pages/InformationPage";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { resolvePageMetadata } from "@/lib/seo";
import { servicePageGraph } from "@/lib/structured-data";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return resolvePageMetadata(locale, "guidance");
}

export default async function GuidancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <InformationPage
      locale={locale}
      dict={dict}
      route="guidance"
      copy={dict.guidancePage}
      graph={servicePageGraph(locale, "guidance", dict)}
      related={["lectures", "faq", "team", "contact"]}
    />
  );
}
