"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type Props = {
  label: string;
  prevLabel: string;
  nextLabel: string;
  children: ReactNode;
};

const EDGE_TOLERANCE = 2;

/**
 * Horizontal snap-scroll track with previous / next controls. Direction-aware:
 * "next" always moves toward the end of the reading order (left in RTL).
 */
export function TestimonialsCarousel({ label, prevLabel, nextLabel, children }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });

  const syncEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const offset = Math.abs(track.scrollLeft);
    const max = track.scrollWidth - track.clientWidth;
    const next = { atStart: offset <= EDGE_TOLERANCE, atEnd: offset >= max - EDGE_TOLERANCE };
    setEdges((prev) => (prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    syncEdges();
    const observer = new ResizeObserver(syncEdges);
    observer.observe(track);
    return () => observer.disconnect();
  }, [syncEdges]);

  const step = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const rtl = getComputedStyle(track).direction === "rtl";
    const card = track.querySelector("li");
    const gap = parseFloat(getComputedStyle(track.firstElementChild as Element).columnGap) || 0;
    const distance = (card?.getBoundingClientRect().width ?? track.clientWidth * 0.8) + gap;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * (rtl ? -1 : 1) * distance, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const forward = (event.key === "ArrowRight") === !rtl;
    event.preventDefault();
    step(forward ? 1 : -1);
  };

  return (
    <div className="mt-12">
      <div
        ref={trackRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onScroll={syncEdges}
        onKeyDown={onKeyDown}
        className="-mx-[var(--gutter)] snap-x snap-mandatory overflow-x-auto scroll-px-[var(--gutter)] px-[var(--gutter)] pb-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-reveal
      >
        {children}
      </div>

      <div className="mt-4 flex justify-center gap-3">
        <ArrowButton label={prevLabel} disabled={edges.atStart} onClick={() => step(-1)} direction="prev" />
        <ArrowButton label={nextLabel} disabled={edges.atEnd} onClick={() => step(1)} direction="next" />
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
      className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-brand-700 transition-colors hover:border-brand-300 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line"
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
