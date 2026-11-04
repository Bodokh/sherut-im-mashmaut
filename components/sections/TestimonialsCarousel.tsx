"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { startTestimonialsAutoplay } from "./testimonials-autoplay";
import styles from "./TestimonialsCarousel.module.css";

type Props = {
  label: string;
  prevLabel: string;
  nextLabel: string;
  playLabel: string;
  pauseLabel: string;
  children: ReactNode;
};

const EDGE_TOLERANCE = 2;

type Position = {
  first: number;
  last: number;
  count: number;
  atStart: boolean;
  atEnd: boolean;
};

/**
 * Horizontal snap-scroll track with previous / next controls. Direction-aware:
 * "next" always moves toward the end of the reading order (left in RTL).
 */
export function TestimonialsCarousel({ label, prevLabel, nextLabel, playLabel, pauseLabel, children }: Props) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const autoplayRef = useRef<ReturnType<typeof startTestimonialsAutoplay> | null>(null);
  const [autoplayEnabled, setAutoplayEnabled] = useState(false);
  const measurements = useRef({ distance: 0, cardWidth: 0, viewportWidth: 0, paddingStart: 0, max: 0, count: 0 });
  const [position, setPosition] = useState<Position>({
    first: 0, last: 0, count: 0, atStart: true, atEnd: true,
  });

  const syncPosition = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const { distance, cardWidth, viewportWidth, paddingStart, max, count } = measurements.current;
    const offset = Math.min(max, Math.abs(track.scrollLeft));
    const atEnd = offset >= max - EDGE_TOLERANCE;
    const first = count && distance
      ? Math.min(count, Math.max(1, Math.floor((offset - paddingStart - cardWidth + EDGE_TOLERANCE) / distance) + 2))
      : 0;
    const last = count && distance
      ? Math.min(count, Math.max(first, Math.ceil((offset + viewportWidth - paddingStart) / distance)))
      : 0;
    const next = { first, last: atEnd ? count : last, count, atStart: offset <= EDGE_TOLERANCE, atEnd };
    // Scroll events remain cheap: geometry is measured on resize, and React
    // updates only when the visible quote range or an edge actually changes.
    setPosition((prev) => (
      prev.first === next.first && prev.last === next.last && prev.count === next.count
      && prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next
    ));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const list = track.firstElementChild;
      const card = list?.querySelector("li");
      const trackStyle = getComputedStyle(track);
      const gap = list ? parseFloat(getComputedStyle(list).columnGap) || 0 : 0;
      const cardWidth = card?.getBoundingClientRect().width ?? 0;
      measurements.current = {
        distance: cardWidth + gap,
        cardWidth,
        viewportWidth: track.clientWidth,
        paddingStart: parseFloat(trackStyle.paddingInlineStart) || 0,
        max: Math.max(0, track.scrollWidth - track.clientWidth),
        count: list?.querySelectorAll("li").length ?? 0,
      };
      syncPosition();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    if (track.firstElementChild) observer.observe(track.firstElementChild);
    return () => observer.disconnect();
  }, [syncPosition, children]);

  const step = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const rtl = getComputedStyle(track).direction === "rtl";
    const distance = measurements.current.distance || track.clientWidth * 0.8;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * (rtl ? -1 : 1) * distance, behavior: reduce ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    const carousel = carouselRef.current;
    const track = trackRef.current;
    if (!carousel || !track) return;
    // Reverse at the edges rather than sweeping across every quote to rewind.
    let direction: 1 | -1 = 1;
    const autoplay = startTestimonialsAutoplay(carousel, track, () => {
      const { max } = measurements.current;
      if (max <= EDGE_TOLERANCE) return;
      const offset = Math.min(max, Math.abs(track.scrollLeft));
      if (offset >= max - EDGE_TOLERANCE) direction = -1;
      else if (offset <= EDGE_TOLERANCE) direction = 1;
      step(direction);
    }, setAutoplayEnabled);
    autoplayRef.current = autoplay;
    return () => { autoplayRef.current = null; autoplay.cleanup(); };
  }, [step]);

  const manualStep = (direction: 1 | -1) => {
    autoplayRef.current?.reset();
    step(direction);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const forward = (event.key === "ArrowRight") === !rtl;
    event.preventDefault();
    manualStep(forward ? 1 : -1);
  };

  return (
    <div ref={carouselRef} className={styles.carousel} data-autoplay={autoplayEnabled ? "playing" : "paused"}>
      <div
        ref={trackRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onScroll={syncPosition}
        onKeyDown={onKeyDown}
        className="-mx-[var(--gutter)] snap-x snap-mandatory overflow-x-auto scroll-px-[var(--gutter)] px-[var(--gutter)] pb-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-reveal
      >
        {children}
      </div>

      <div className={styles.controls}>
        <bdi dir="ltr" className={styles.counter}>
          {position.count ? <><span>{position.first}</span><span className={styles.separator}>/</span><span>{position.count}</span></> : "\u00a0"}
        </bdi>
        <div className={styles.progress} aria-hidden="true">
          <span className={styles.progressFill} style={{ transform: `scaleX(${position.count ? position.last / position.count : 0})` }} />
        </div>
        <div className={styles.arrows}>
          <button
            type="button"
            aria-label={`${autoplayEnabled ? pauseLabel : playLabel}: ${label}`}
            onClick={() => autoplayRef.current?.toggle()}
            className={styles.arrow}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              {autoplayEnabled ? <path d="M7 5h3v14H7zm7 0h3v14h-3z" /> : <path d="m8 5 11 7-11 7z" />}
            </svg>
          </button>
          <ArrowButton label={prevLabel} disabled={position.atStart} onClick={() => manualStep(-1)} direction="prev" />
          <ArrowButton label={nextLabel} disabled={position.atEnd} onClick={() => manualStep(1)} direction="next" />
        </div>
      </div>
    </div>
  );
}

function ArrowButton({
  label,
  disabled,
  onClick,
  direction,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  direction: "prev" | "next";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={styles.arrow}
    >
      <svg
        viewBox="0 0 24 24"
        className={direction === "prev" ? "h-5 w-5 -scale-x-100 rtl:scale-x-100" : "h-5 w-5 rtl:-scale-x-100"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
