import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoGrid } from "@/components/gallery/PhotoGrid";
import { JsonLd } from "@/components/seo/JsonLd";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
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
        <section className={styles.intro} data-theme="dark">
          <div className={`shell ${styles.introInner}`}>
            <Breadcrumbs locale={locale} route="gallery" dict={dict} />
            <div className={styles.introContent}>
              <h1>{t.title}</h1>
              <p>{t.lead}</p>
            </div>
          </div>
        </section>
        <Section className={styles.collection}>
          <p className={styles.hint}>{t.hint}</p>
          <PhotoGrid photos={galleryPhotos} locale={locale} labels={t} />
        </Section>
        <Section className={styles.related}>
          <RelatedLinks locale={locale} dict={dict} routes={["lectures", "videos", "contact"]} />
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
