import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/pages/LegalPage";
import { isLocale } from "@/i18n/config";
import { resolvePageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return resolvePageMetadata(locale, "terms");
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LegalPage locale={locale} route="terms" />;
}
