"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { PlayerFrame, type PlayableVideo } from "./YouTubePlayer";

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<GridVideo | null>(null);

  const open = (video: GridVideo) => {
    setActive(video);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  return (
    <>
      <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video) => (
          <li key={video.id}>
            <button
              type="button"
              onClick={() => open(video)}
              aria-label={`${playLabel}: ${video.title}`}
              className="group block w-full text-start focus-visible:outline-offset-4"
            >
              <span className="relative block aspect-video overflow-hidden rounded-2xl bg-brand-100 ring-1 ring-brand-950/5">
                <Image
                  src={video.thumbnail}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 380px"
                  className="object-cover transition-transform duration-700 ease-out-quart group-hover:scale-[1.04]"
                />
                <span aria-hidden className="absolute inset-0 bg-brand-950/0 transition-colors duration-300 group-hover:bg-brand-950/20" />
                {video.duration ? (
                  <span className="absolute bottom-3 end-3 rounded-full bg-brand-950/75 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white backdrop-blur-sm" dir="ltr">
                    {video.duration}
                  </span>
                ) : null}
              </span>
              <span className="mt-4 line-clamp-2 block text-lg font-bold leading-snug text-ink-950 transition-colors group-hover:text-brand-700">
                {video.title}
              </span>
              <time dateTime={video.publishedAt} className="mt-1.5 block text-sm text-ink-600">
                {video.publishedLabel}
              </time>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={active?.title}
        onClose={() => setActive(null)}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) close();
        }}
        className="video-dialog m-auto w-[min(72rem,calc(100vw-2rem))] max-w-none overflow-visible bg-transparent p-0 text-white backdrop:bg-brand-950/85 backdrop:backdrop-blur-sm"
      >
        {active ? (
          <div>
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="line-clamp-1 text-base font-bold text-white sm:text-lg">{active.title}</h2>
              <button
                type="button"
                onClick={close}
                aria-label={closeLabel}
                autoFocus
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-black shadow-lift">
              <PlayerFrame video={active} />
            </div>
            <a
              href={active.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-200 underline-offset-4 hover:text-white hover:underline"
            >
              {watchOnYoutubeLabel}
            </a>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
