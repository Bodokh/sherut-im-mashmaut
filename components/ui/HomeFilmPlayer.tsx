"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type PlayerLabels = {
  play: string;
  pause: string;
  mute: string;
  unmute: string;
  fullscreen: string;
  exitFullscreen: string;
  seek: string;
};

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function PlayIcon({ paused }: { paused: boolean }) {
  return paused ? (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M8 5.3v13.4c0 .8.9 1.3 1.6.8l9.8-6.7a1 1 0 0 0 0-1.6L9.6 4.5C8.9 4 8 4.5 8 5.3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-13Z" />
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6.7 8.5H3.5v7h3.2L11 19V5Z" />
      {muted ? (
        <path strokeLinecap="round" d="m15.5 9 5 5m0-5-5 5" />
      ) : (
        <path strokeLinecap="round" d="M15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" />
      )}
    </svg>
  );
}

function FullscreenIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {active ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v5H4m16 0h-5V4M4 15h5v5m6 0v-5h5" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H4v5m16 0V4h-5M4 15v5h5m6 0h5v-5" />
      )}
    </svg>
  );
}

export function HomeFilmPlayer({
  src,
  poster,
  title,
  durationLabel,
  labels,
}: {
  src: string;
  poster: string;
  title: string;
  durationLabel: string;
  labels: PlayerLabels;
}) {
  const frameRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(29);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === frameRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = () => {
    const frame = frameRef.current;
    if (!frame) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }

    void frame.requestFullscreen().catch(() => undefined);
  };

  const seek = (value: string) => {
    const video = videoRef.current;
    if (!video) return;

    const nextTime = Number(value);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <figure
      ref={frameRef}
      className="home-film-player overflow-hidden rounded-[1.75rem] bg-brand-950 shadow-glow ring-1 ring-brand-950/10"
    >
      <div className="relative bg-brand-950">
        <video
          ref={videoRef}
          className="aspect-video w-full cursor-pointer bg-brand-950 object-cover"
          playsInline
          preload="metadata"
          poster={poster}
          aria-label={title}
          onClick={togglePlayback}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onDurationChange={(event) => setDuration(event.currentTarget.duration || 29)}
          onVolumeChange={(event) => setIsMuted(event.currentTarget.muted)}
        >
          <source src={src} type="video/mp4" />
          <a href={src}>{title}</a>
        </video>

        {!isPlaying ? (
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={labels.play}
            className="group/play absolute inset-0 m-auto flex h-16 w-16 items-center justify-center self-center rounded-full bg-white/95 text-brand-800 shadow-lift transition duration-300 hover:scale-105 hover:bg-white focus-visible:outline-offset-4 sm:h-[4.5rem] sm:w-[4.5rem]"
          >
            <span aria-hidden className="absolute inset-0 rounded-full ring-8 ring-white/20 transition group-hover/play:ring-[12px]" />
            <span className="ms-0.5">
              <PlayIcon paused />
            </span>
          </button>
        ) : null}
      </div>

      <figcaption className="bg-brand-950 px-4 pb-3 pt-2 text-brand-50 sm:px-5 sm:pb-3">
        <div className="mb-1 flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 font-display text-sm font-bold sm:text-base">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green-400" />
            {title}
          </span>
          <span className="text-xs font-semibold text-brand-200 sm:text-sm">{durationLabel}</span>
        </div>

        <input
          dir="ltr"
          type="range"
          min="0"
          max={duration || 0}
          step="0.05"
          value={Math.min(currentTime, duration || 0)}
          onInput={(event) => seek(event.currentTarget.value)}
          aria-label={labels.seek}
          aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
          className="home-film-progress block w-full"
          style={{ "--progress": `${progress}%` } as CSSProperties}
        />

        <div className="mt-1 flex items-center gap-2" dir="ltr">
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={isPlaying ? labels.pause : labels.play}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-600 text-white transition hover:bg-green-500"
          >
            <PlayIcon paused={!isPlaying} />
          </button>

          <span className="min-w-[5.5rem] text-center font-mono text-xs font-semibold tabular-nums text-brand-100 sm:text-sm" aria-hidden="true">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <span className="ms-auto flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? labels.unmute : labels.mute}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-100 transition hover:bg-white/10 hover:text-white"
            >
              <VolumeIcon muted={isMuted} />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? labels.exitFullscreen : labels.fullscreen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-100 transition hover:bg-white/10 hover:text-white"
            >
              <FullscreenIcon active={isFullscreen} />
            </button>
          </span>
        </div>
      </figcaption>
    </figure>
  );
}
