"use client";

import { useLayoutEffect, useRef } from "react";

function hashDestination() {
  const hash = window.location.hash;
  if (!hash) return null;
  let id: string;
  try { id = decodeURIComponent(hash.slice(1)); } catch { return null; }
  const target = document.getElementById(id);
  if (!target) return null;
  const offset = (parseFloat(getComputedStyle(target).scrollMarginTop) || 0) + (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
  const destination = window.scrollY + target.getBoundingClientRect().top - offset;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  return { hash, target, destination: Math.min(maxScroll, Math.max(0, destination)) };
}

/** Enables native pinning only while every text panel fits below the header. */
export function PinnedSceneFit() {
  const probeRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const probe = probeRef.current;
    const section = probe?.closest("section");
    if (!probe || !section || !window.ResizeObserver || !CSS.supports("animation-timeline", "view()")) return;

    const panels = Array.from(section.querySelectorAll<HTMLElement>("[data-pinned-content]"));
    const eligible = window.matchMedia("(min-width: 1000px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)");
    let active = true;
    const initialAnchor = eligible.matches ? hashDestination() : null;
    let initialLayoutChanged = false;
    let anchorCancelled = false;
    let layoutReady = false;
    let scrollFinished = false;
    let anchorFrame = 0;
    let anchorTimeout = 0;
    const inputEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

    function removeInputListeners() {
      inputEvents.forEach((event) => window.removeEventListener(event, cancelAnchor, true));
    }

    function cancelAnchor() {
      anchorCancelled = true;
      cancelAnimationFrame(anchorFrame);
      window.clearTimeout(anchorTimeout);
      document.removeEventListener("scrollend", finishScrolling);
      removeInputListeners();
    }

    function finishAnchor() {
      if (!active || anchorCancelled || !initialAnchor || !layoutReady) return;
      const shouldCorrect = initialLayoutChanged && window.location.hash === initialAnchor.hash && initialAnchor.target.isConnected && Math.abs(window.scrollY - initialAnchor.destination) <= 4;
      cancelAnchor();
      if (shouldCorrect) initialAnchor.target.scrollIntoView({ block: "start", behavior: "instant" });
    }

    function finishScrolling() {
      scrollFinished = true;
      if (layoutReady) finishAnchor();
    }

    function measure() {
      if (!active || !probe || !section) return;
      const availableHeight = probe.getBoundingClientRect().height;
      const fits = eligible.matches && availableHeight > 0 && panels.length > 0 && panels.every((panel) => panel.scrollHeight <= availableHeight - 2);
      const changed = fits !== (section.dataset.pinnedFit === "true");
      if (changed) initialLayoutChanged = true;
      if (fits) section.dataset.pinnedFit = "true";
      else delete section.dataset.pinnedFit;
    }

    // These intrinsic panel sizes are unchanged by pinning, so the observer
    // cannot oscillate between the fixed stage and the document-flow fallback.
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    panels.forEach((panel) => observer.observe(panel));
    eligible.addEventListener("change", measure);
    document.fonts.addEventListener("loadingdone", measure);
    if (initialAnchor) {
      inputEvents.forEach((event) => window.addEventListener(event, cancelAnchor, { capture: true, passive: true }));
      document.addEventListener("scrollend", finishScrolling);
    }
    void document.fonts.ready.then(() => {
      measure();
      if (!initialAnchor || !active || anchorCancelled) return;
      // Initial smooth hash scrolling can still target the pre-hydration
      // layout. Correct only that destination, preserving Back's saved reading
      // position and any reader who has already interacted with the page.
      anchorFrame = requestAnimationFrame(() => {
        anchorFrame = requestAnimationFrame(() => {
          layoutReady = true;
          if (scrollFinished || Math.abs(window.scrollY - initialAnchor.destination) <= 4) finishAnchor();
          else anchorTimeout = window.setTimeout(cancelAnchor, 3000);
        });
      });
    });
    measure();

    return () => {
      active = false;
      cancelAnchor();
      observer.disconnect();
      eligible.removeEventListener("change", measure);
      document.fonts.removeEventListener("loadingdone", measure);
      delete section.dataset.pinnedFit;
    };
  }, []);

  return <span ref={probeRef} aria-hidden="true" data-pinned-fit-probe="" style={{ position: "absolute", width: 0, height: "calc(100svh - var(--header-h))", visibility: "hidden", pointerEvents: "none" }} />;
}
