"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { GalleryPhoto } from "@/lib/gallery";
import styles from "./PhotoGrid.module.css";

export function PhotoGrid({ photos, locale, openLabel, closeLabel }: {
  photos: readonly GalleryPhoto[];
  locale: Locale;
  openLabel: string;
  closeLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<GalleryPhoto | null>(null);

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [active]);

  return (
    <>
      <ul className={styles.grid}>
        {photos.map((photo) => (
          <li key={photo.src}>
            <button
              type="button"
              className={styles.trigger}
              onClick={() => setActive(photo)}
              aria-label={`${openLabel}: ${photo.alt[locale]}`}
              aria-haspopup="dialog"
            >
              <Image src={photo.src} alt="" width={photo.width} height={photo.height}
                sizes="(max-width: 639px) 90vw, (max-width: 1023px) 44vw, (max-width: 1408px) 30vw, 440px"
                className={styles.thumbnail} />
              <span className={styles.enlarge} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <dialog ref={dialogRef} aria-label={active?.alt[locale]} className={styles.dialog}
        onClose={() => setActive(null)}
        onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
        {active ? (
          <div className={styles.panel}>
            <button type="button" autoFocus className={styles.close} aria-label={closeLabel}
              onClick={() => dialogRef.current?.close()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
            <Image src={active.src} alt={active.alt[locale]} width={active.width} height={active.height}
              sizes="(max-width: 1200px) 94vw, 1200px" className={styles.fullPhoto} />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
