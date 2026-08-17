"use client";

import { useRef, useState } from "react";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-8 sm:w-8" fill="currentColor" aria-hidden="true">
      <path d="M8 5.3v13.4c0 .8.9 1.3 1.6.8l9.8-6.7a1 1 0 0 0 0-1.6L9.6 4.5C8.9 4 8 4.5 8 5.3Z" />
    </svg>
  );
}

export function HomeFilmPlayer({
  src,
  poster,
  title,
  playLabel,
}: {
  src: string;
  poster: string;
  title: string;
  playLabel: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      void video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  };

  return (
    <figure className="home-film-player overflow-hidden rounded-[1.75rem] bg-brand-950 shadow-glow ring-1 ring-brand-950/10">
      <div className="relative bg-brand-950">
        <video
          ref={videoRef}
          className="aspect-video w-full cursor-pointer bg-brand-950 object-cover"
          playsInline
          preload="metadata"
          poster={poster}
          controls={false}
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          aria-label={title}
          onClick={togglePlayback}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        >
          <source src={src} type="video/mp4" />
          <a href={src}>{title}</a>
        </video>

        {!isPlaying ? (
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={playLabel}
            className="group/play absolute inset-0 m-auto flex h-16 w-16 items-center justify-center self-center rounded-full bg-white/95 text-brand-800 shadow-lift transition duration-300 hover:scale-105 hover:bg-white focus-visible:outline-offset-4 sm:h-[4.5rem] sm:w-[4.5rem]"
          >
            <span aria-hidden className="absolute inset-0 rounded-full ring-8 ring-white/20 transition group-hover/play:ring-[12px]" />
            <span className="ms-0.5">
              <PlayIcon />
            </span>
          </button>
        ) : null}
      </div>
    </figure>
  );
}
