"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import styles from "./YouTubePlayer.module.css";

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
    <div className={styles.player}>
      {playing ? (
        <PlayerFrame video={video} />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className={styles.trigger}
        >
          <span className="sr-only">{playLabel}: {video.title}{" "}</span>
          <Image
            src={video.thumbnail}
            alt=""
            fill
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            sizes="(max-width: 760px) 90vw, (max-width: 1408px) 90vw, 1280px"
            className={styles.poster}
          />
          <span aria-hidden className={styles.shade} />
          <span className={styles.play}>
            <PlayIcon />
          </span>
          {video.duration ? (
            <span className={styles.duration} dir="ltr">
              {video.duration}
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}
