"use client";

import { useEffect } from "react";

const MAP_ID = "reach-map-visual";

export function ReachMapMotion() {
  useEffect(() => {
    const map = document.getElementById(MAP_ID);
    if (!map) return;

    const debug = new URLSearchParams(window.location.search).has("mapdebug");
    const setDebugState = (state: string) => {
      if (debug) map.dataset.mapDebug = state;
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      delete map.dataset.mapMotion;
      setDebugState("reduced-motion");
      return;
    }

    if (!("IntersectionObserver" in window)) {
      setDebugState("observer-unavailable");
      return;
    }

    const bounds = map.getBoundingClientRect();
    const alreadyInView = bounds.top < window.innerHeight * 0.88 && bounds.bottom > 0;
    map.dataset.mapMotion = "armed";
    setDebugState("armed");

    let frame = 0;
    const reveal = () => {
      frame = window.requestAnimationFrame(() => {
        map.dataset.mapMotion = "visible";
        setDebugState("visible");
      });
    };

    if (alreadyInView) {
      reveal();
      return () => {
        if (frame) window.cancelAnimationFrame(frame);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;

        reveal();
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.18 },
    );

    observer.observe(map);

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
