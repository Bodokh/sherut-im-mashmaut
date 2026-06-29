"use client";

import { useEffect } from "react";

/**
 * One tiny client island that drives the scroll reveals robustly:
 *  - Reduced motion / no JS  → nothing is armed, everything stays visible.
 *  - Elements already in view at load are left visible (never hidden).
 *  - Below-fold elements are armed (hidden) and revealed by IntersectionObserver.
 *  - A scroll fallback reveals anything the observer misses (fast scroll, anchor
 *    jumps), so content is never stuck hidden.
 */
export function RevealController() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (reduce || els.length === 0) return;

    const armThreshold = window.innerHeight * 0.85;
    let pending: HTMLElement[] = [];

    for (const el of els) {
      if (el.getBoundingClientRect().top >= armThreshold) {
        el.classList.add("reveal-armed");
        pending.push(el);
      }
      // in-view-at-load elements stay visible with no entrance — no flash.
    }

    const reveal = (el: HTMLElement) => el.classList.add("is-in");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target as HTMLElement);
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    pending.forEach((el) => observer.observe(el));

    // Fallback: reveal armed elements that have entered but the observer missed.
    let raf = 0;
    const sweep = () => {
      raf = 0;
      const vh = window.innerHeight;
      pending = pending.filter((el) => {
        if (el.classList.contains("is-in")) return false;
        if (el.getBoundingClientRect().top < vh * 0.92) {
          reveal(el);
          observer.unobserve(el);
          return false;
        }
        return true;
      });
      if (pending.length === 0) window.removeEventListener("scroll", onScroll);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(sweep);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
