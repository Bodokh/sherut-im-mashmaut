"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";

export type PlayableVideo = {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  embedUrl: string;
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ms-1 h-7 w-7 sm:h-8 sm:w-8" fill="currentColor" aria-hidden="true">
      <path d="M8 5.3v13.4c0 .8.9 1.3 1.6.8l9.8-6.7a1 1 0 0 0 0-1.6L9.6 4.5C8.9 4 8 4.5 8 5.3Z" />
    </svg>
  );
}

export function PlayerFrame({ video, className }: { video: PlayableVideo; className?: string }) {
  return (
    <iframe
      src={`${video.embedUrl}?autoplay=1&rel=0&modestbranding=1`}
      title={video.title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      className={cn("absolute inset-0 h-full w-full border-0", className)}
    />
  );
}

/**
 * Shows the thumbnail until someone presses play, so YouTube's player (and its
 * ~1MB of script) loads only for visitors who actually watch.
 */
export function YouTubePlayer({
  video,
  playLabel,
  priority,
}: {
  video: PlayableVideo;
  playLabel: string;
  priority?: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[1.75rem] bg-brand-950 shadow-glow ring-1 ring-white/10">
      {playing ? (
        <PlayerFrame video={video} />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`${playLabel}: ${video.title}`}
          className="group absolute inset-0 flex items-center justify-center focus-visible:outline-offset-[-6px]"
        >
          <Image
            src={video.thumbnail}
            alt=""
            fill
            preload={priority}
            fetchPriority={priority ? "high" : undefined}
            sizes="(max-width: 1024px) 92vw, 760px"
            className="object-cover transition-transform duration-[1.2s] ease-out-quart group-hover:scale-[1.03]"
          />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-brand-950/60 via-transparent to-brand-950/10" />
          <span className="relative inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-white/95 text-brand-800 shadow-lift transition duration-300 group-hover:scale-105 group-hover:bg-white sm:h-20 sm:w-20">
            <span aria-hidden className="absolute inset-0 rounded-full ring-8 ring-white/20 transition-[box-shadow] group-hover:ring-[12px]" />
            <PlayIcon />
          </span>
          {video.duration ? (
            <span className="absolute bottom-4 end-4 rounded-full bg-brand-950/75 px-3 py-1 text-sm font-semibold tabular-nums text-white backdrop-blur-sm" dir="ltr">
              {video.duration}
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}
