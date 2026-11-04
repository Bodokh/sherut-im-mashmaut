"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import styles from "./HomeFilmPlayer.module.css";

type PlayerLabels = Dictionary["hero"]["player"];

function formatTime(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

function PlayIcon({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {paused ? <path d="m9 5 11 7-11 7V5Z" /> : <path d="M6 5h4v14H6zm8 0h4v14h-4z" />}
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6.7 8.5H3.5v7h3.2L11 19V5Z" />
      {muted ? <path strokeLinecap="round" d="m15.5 9 5 5m0-5-5 5" /> : <path strokeLinecap="round" d="M15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}

function FullscreenIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={active ? "M9 4v5H4m16 0h-5V4M4 15h5v5m6 0v-5h5" : "M9 4H4v5m16 0V4h-5M4 15v5h5m6 0h5v-5"} />
    </svg>
  );
}

export function HomeFilmPlayer({ src, poster, title, closeLabel, duration, labels }: {
  src: string; poster: string; title: string; closeLabel: string; duration: string; labels: PlayerLabels;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedViewport, setExpandedViewport] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const playVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.ended) video.currentTime = 0;
    void video.play().catch(() => setPlaying(false));
  };

  const play = () => {
    const video = videoRef.current;
    const dialog = dialogRef.current;
    if (!video || !dialog) return;
    // Attach media only within the deliberate play action, preserving the
    // browser's user gesture and keeping film bytes out of the initial load.
    if (!video.getAttribute("src")) video.src = src;
    dialog.showModal();
    setOpen(true);
    playVideo();
  };

  const togglePlayback = () => {
    if (videoRef.current?.paused) playVideo();
    else videoRef.current?.pause();
  };

  const closePlayer = () => {
    videoRef.current?.pause();
    if (document.fullscreenElement === frameRef.current) {
      void document.exitFullscreen().catch(() => undefined).finally(() => dialogRef.current?.close());
    } else dialogRef.current?.close();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement === frameRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (expandedViewport) {
      setExpandedViewport(false);
    } else if (document.fullscreenEnabled && frameRef.current?.requestFullscreen) {
      // Embedded browsers can reject fullscreen on a dialog descendant. Keep
      // the same custom controls and offer the full viewport in that case.
      void frameRef.current.requestFullscreen().catch(() => {
        if (dialogRef.current?.open) setExpandedViewport(true);
      });
    } else {
      setExpandedViewport(true);
    }
  };

  const seek = (value: string) => {
    if (!videoRef.current || !mediaDuration) return;
    const time = Math.min(mediaDuration, Math.max(0, Number(value)));
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const progress = mediaDuration > 0 ? Math.min(100, (currentTime / mediaDuration) * 100) : 0;

  return (
    <>
      <Image className={styles.poster} src={poster} alt="" fill sizes="100vw" preload />
      <div className={styles.shade} aria-hidden="true" />
      <button type="button" className={styles.play} onClick={play}>
        <span className={styles.circle}>
          <PlayIcon paused />
        </span>
        <span className={styles.label}><span>{title}</span>{" "}<span>{duration}</span></span>
      </button>
      <dialog ref={dialogRef} className={styles.dialog} data-expanded={expandedViewport} aria-label={title} onCancel={(event) => {
        if (expandedViewport) {
          event.preventDefault();
          setExpandedViewport(false);
        }
      }} onClose={() => {
        videoRef.current?.pause();
        setOpen(false);
        setExpandedViewport(false);
        if (document.fullscreenElement === frameRef.current) void document.exitFullscreen().catch(() => undefined);
      }}>
        <div ref={frameRef} className={styles.playerFrame}>
          <div className={styles.toolbar}>
            <span>{title}</span>
            <button type="button" onClick={closePlayer} aria-label={closeLabel}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className={styles.videoStage}>
            <video ref={videoRef} className={styles.video} playsInline preload="none" controls={false} aria-label={title}
              onClick={togglePlayback}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onDurationChange={(event) => setMediaDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
              onVolumeChange={(event) => setMuted(event.currentTarget.muted)}>
              <a href={src}>{title}</a>
            </video>
            {!playing ? <button type="button" className={styles.centerPlay} onClick={playVideo} aria-label={labels.play}><PlayIcon paused /></button> : null}
          </div>
          <div className={styles.controls}>
            <input dir="ltr" type="range" min="0" max={mediaDuration || 0} step="0.05"
              value={Math.min(currentTime, mediaDuration)} disabled={!mediaDuration}
              onChange={(event) => seek(event.currentTarget.value)}
              aria-label={labels.seek} aria-valuetext={`${formatTime(currentTime)} / ${formatTime(mediaDuration)}`}
              className={`home-film-progress ${styles.progress}`} style={{ "--progress": `${progress}%` } as CSSProperties} />
            <div className={styles.controlRow} dir="ltr">
              <button type="button" className={`${styles.controlButton} ${styles.playControl}`} onClick={togglePlayback} aria-label={playing ? labels.pause : labels.play}><PlayIcon paused={!playing} /></button>
              <bdi dir="ltr" className={styles.time} aria-hidden="true">{formatTime(currentTime)} / {formatTime(mediaDuration)}</bdi>
              <span className={styles.endControls}>
                <button type="button" className={styles.controlButton} onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }} aria-label={muted ? labels.unmute : labels.mute}><VolumeIcon muted={muted} /></button>
                <button type="button" className={styles.controlButton} onClick={toggleFullscreen} aria-label={fullscreen || expandedViewport ? labels.exitFullscreen : labels.fullscreen}><FullscreenIcon active={fullscreen || expandedViewport} /></button>
              </span>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
