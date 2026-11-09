"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { GalleryPhoto } from "@/lib/gallery";
import styles from "./PhotoGrid.module.css";

export function PhotoGrid({ photos, locale, labels }: {
  photos: readonly GalleryPhoto[];
  locale: Locale;
  labels: Pick<Dictionary["gallery"], "title" | "openPhoto" | "closePhoto" | "previousPhoto" | "nextPhoto" | "photoLabel">;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex === null ? undefined : photos[activeIndex];
  const isOpen = Boolean(active);
  const rtl = locale === "he";

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) filmstripRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex, isOpen]);

  const move = (step: number) => {
    if (photos.length < 2) return;
    setActiveIndex((current) => current === null ? null : (current + step + photos.length) % photos.length);
  };
  const close = () => dialogRef.current?.close();

  return (
    <>
      <ul className={styles.grid}>
        {photos.map((photo, index) => (
          <li key={photo.src}>
            <button
              type="button"
              className={styles.trigger}
              onClick={() => setActiveIndex(index)}
              aria-label={`${labels.openPhoto}: ${photo.alt[locale]}`}
              aria-haspopup="dialog"
            >
              <Image src={photo.src} alt="" width={photo.width} height={photo.height}
                sizes="(max-width: 899px) 44vw, (max-width: 1408px) 30vw, 440px"
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
      <dialog ref={dialogRef} aria-label={labels.title} dir={rtl ? "rtl" : "ltr"} className={styles.dialog}
        onClose={() => setActiveIndex(null)}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}
        onKeyDown={(event) => {
          if (photos.length < 2 || event.altKey || event.ctrlKey || event.metaKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
          event.preventDefault();
          move(event.key === (rtl ? "ArrowLeft" : "ArrowRight") ? 1 : -1);
        }}>
        {active && activeIndex !== null ? (
          <div className={styles.panel}>
            <div className={styles.toolbar}>
              <span className={styles.albumTitle}>{labels.title}</span>
              <button type="button" autoFocus className={styles.close} aria-label={labels.closePhoto} onClick={close}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className={styles.stage}
              onClickCapture={(event) => {
                const ignoreClick = swiped.current && event.detail > 0;
                swiped.current = false;
                if (ignoreClick) { event.preventDefault(); event.stopPropagation(); }
              }}
              onClick={(event) => {
                if (event.target === event.currentTarget) close();
              }}
              onPointerDown={(event) => {
                swiped.current = false;
                touchStart.current = event.pointerType === "touch" ? { x: event.clientX, y: event.clientY } : null;
              }}
              onPointerCancel={() => { touchStart.current = null; }}
              onPointerUp={(event) => {
                const start = touchStart.current;
                touchStart.current = null;
                if (!start || event.pointerType !== "touch") return;
                const x = event.clientX - start.x;
                const y = event.clientY - start.y;
                if (Math.abs(x) > 50 && Math.abs(x) > Math.abs(y) * 1.5) {
                  swiped.current = true;
                  move((x < 0 ? 1 : -1) * (rtl ? -1 : 1));
                }
              }}>
              <Image src={active.src} alt={active.alt[locale]} width={active.width} height={active.height}
                sizes="(max-width: 639px) 94vw, 84vw" loading="eager" draggable={false} className={styles.fullPhoto} />
              {photos.length > 1 ? (
                <>
                  <button type="button" className={`${styles.navigation} ${styles.previous}`} aria-label={labels.previousPhoto} onClick={() => move(-1)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <path d={rtl ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button type="button" className={`${styles.navigation} ${styles.next}`} aria-label={labels.nextPhoto} onClick={() => move(1)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <path d={rtl ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </>
              ) : null}
            </div>
            <div className={styles.caption} role="status" aria-live="polite" aria-atomic="true">
              <span className={styles.counter}>{labels.photoLabel} <bdi dir="ltr">{activeIndex + 1} / {photos.length}</bdi></span>
              <p>{active.alt[locale]}</p>
            </div>
            {photos.length > 1 ? (
              <div ref={filmstripRef} className={styles.filmstrip}>
                {photos.map((photo, index) => (
                  <button key={photo.src} type="button" className={styles.thumbnailButton}
                    aria-label={`${labels.openPhoto} ${index + 1}: ${photo.alt[locale]}`}
                    aria-current={activeIndex === index ? "true" : undefined} onClick={() => setActiveIndex(index)}>
                    <Image src={photo.src} alt="" width={photo.width} height={photo.height} sizes="72px" className={styles.filmPhoto} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
