"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PlayerFrame, type PlayableVideo } from "./YouTubePlayer";
import styles from "./VideoGrid.module.css";

export type GridVideo = PlayableVideo & {
  publishedLabel: string;
  publishedAt: string;
  watchUrl: string;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

export function VideoGrid({
  videos,
  playLabel,
  closeLabel,
  watchOnYoutubeLabel,
}: {
  videos: GridVideo[];
  playLabel: string;
  closeLabel: string;
  watchOnYoutubeLabel: string;
}) {
  const gridRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<GridVideo | null>(null);
  const [loadedThumbnails, setLoadedThumbnails] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const reveal = (ids: string[]) => {
      setLoadedThumbnails((previous) => {
        const additions = ids.filter((id) => !previous.has(id));
        return additions.length ? new Set([...previous, ...additions]) : previous;
      });
    };

    // Native image lazy loading can fetch more than a viewport ahead. Keep
    // the gallery's real images out of the initial request queue instead.
    // Initial server and client markup both reserve the same empty frames.
    if (typeof IntersectionObserver === "undefined") {
      reveal(videos.map((video) => video.id));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const ids: string[] = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.getAttribute("data-video-id");
        if (id) ids.push(id);
        observer.unobserve(entry.target);
      }
      if (ids.length) reveal(ids);
    }, { rootMargin: "280px 0px", threshold: 0 });

    grid.querySelectorAll("[data-video-id]").forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [videos]);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = previousOverflow; };
  }, [active]);

  const open = (video: GridVideo) => {
    setActive(video);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  return (
    <>
      <ul ref={gridRef} className={styles.grid}>
        {videos.map((video, index) => (
          <li key={video.id} data-video-id={video.id}>
            <button
              type="button"
              onClick={() => open(video)}
              className={styles.trigger}
            >
              <span className="sr-only">{playLabel}: </span>
              <span className={styles.thumbnail}>
                {loadedThumbnails.has(video.id) ? <Image
                  src={video.thumbnail}
                  alt=""
                  fill
                  loading="eager"
                  fetchPriority="low"
                  sizes={index === 0
                    ? "(max-width: 639px) 90vw, (max-width: 1023px) 44vw, (max-width: 1408px) 60vw, 820px"
                    : "(max-width: 639px) 90vw, (max-width: 1023px) 44vw, 390px"}
                  className={styles.poster}
                /> : null}
                <span aria-hidden className={styles.play}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 5 11 7-11 7V5Z" /></svg>
                </span>
                {video.duration ? (
                  <span className={styles.duration} dir="ltr">
                    {video.duration}
                  </span>
                ) : null}
              </span>
              {" "}
              <span className={styles.title}>
                {video.title}
              </span>
              {" "}
              <time dateTime={video.publishedAt} className={styles.date}>
                {video.publishedLabel}
              </time>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={active?.title}
        data-theme="dark"
        onClose={() => setActive(null)}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) close();
        }}
        className={styles.dialog}
      >
        {active ? (
          <div className={styles.dialogPanel}>
            <div className={styles.toolbar}>
              <h2>{active.title}</h2>
              <button
                type="button"
                onClick={close}
                aria-label={closeLabel}
                autoFocus
                className={styles.close}
              >
                <CloseIcon />
              </button>
            </div>
            <div className={styles.modalStage}>
              <PlayerFrame video={active} />
            </div>
            <a
              href={active.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.watchLink}
            >
              {watchOnYoutubeLabel}
            </a>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
