import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoGrid } from "@/components/gallery/PhotoGrid";
import { PublicPageHero } from "@/components/pages/PublicPageHero";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer } from "@/components/site/Footer";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { Section } from "@/components/ui/Section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { galleryPhotos } from "@/lib/gallery";
import { resolvePageMetadata } from "@/lib/seo";
import { standardPageGraph } from "@/lib/structured-data";
import styles from "./gallery.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return resolvePageMetadata(locale, "gallery");
}

export default async function GalleryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const t = dict.gallery;

  return (
    <>
      <Header locale={locale} currentRoute="gallery" copy={buildHeaderCopy(dict)} />
      <JsonLd data={standardPageGraph(locale, "gallery", dict)} />
      <main id="main" className={styles.page}>
        <PublicPageHero locale={locale} route="gallery" dict={dict} title={t.title} lead={t.lead} compact />
        <Section>
          <p className={styles.hint}>{t.hint}</p>
          <PhotoGrid photos={galleryPhotos} locale={locale} openLabel={t.openPhoto} closeLabel={t.closePhoto} />
        </Section>
        <Section className="py-14 sm:py-16">
          <RelatedLinks locale={locale} dict={dict} routes={["lectures", "videos", "contact"]} />
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
