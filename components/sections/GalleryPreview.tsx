import { PhotoGrid } from "@/components/gallery/PhotoGrid";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { galleryPhotos } from "@/lib/gallery";
import { localizedPath } from "@/lib/routes";
import styles from "./GalleryPreview.module.css";

const previewPhotos = [0, 2, 3, 4, 5, 6].map((index) => galleryPhotos[index]);

export function GalleryPreview({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.gallery;
  return (
    <Section id="gallery" tone="surface" className={styles.section}>
      <div className={styles.heading}>
        <div><h2>{t.title}</h2><p>{t.previewLead}</p></div>
        <Button href={localizedPath(locale, "gallery")} variant="outline" arrow>{t.viewAll}</Button>
      </div>
      <PhotoGrid photos={previewPhotos} locale={locale} labels={t} />
    </Section>
  );
}
