import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { defaultLocale, isLocale } from "@/i18n/config";
import { buildNotFoundMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildNotFoundMetadata(isLocale(locale) ? locale : defaultLocale);
}

export default function MissingLocalePage() {
  notFound();
}
