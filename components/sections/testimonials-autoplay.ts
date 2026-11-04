const READING_INTERVAL = Math.round(8_000 / 1.7);

/** One timer while the reader can see the carousel, never a background loop. */
export function startTestimonialsAutoplay(
  carousel: HTMLElement,
  track: HTMLElement,
  advance: () => void,
  onEnabledChange: (enabled: boolean) => void,
) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let enabled = !motion.matches;
  let visible = !window.IntersectionObserver;
  let hovering = false;
  let focused = carousel.contains(document.activeElement);
  let dragging = false;
  let disposed = false;
  let timer = 0;

  function schedule() {
    window.clearTimeout(timer);
    if (disposed || !enabled || !visible || hovering || focused || dragging || document.hidden) return;
    timer = window.setTimeout(() => {
      advance();
      schedule();
    }, READING_INTERVAL);
  }

  function pointerEnter(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    hovering = true;
    schedule();
  }

  function pointerLeave() { hovering = false; schedule(); }
  function focusIn() { focused = true; schedule(); }
  function focusOut(event: FocusEvent) { focused = carousel.contains(event.relatedTarget as Node | null); schedule(); }
  function pointerDown() { dragging = true; schedule(); }
  function pointerUp() { dragging = false; schedule(); }
  function motionChange() {
    // A newly enabled motion preference always stops automatic movement.
    if (motion.matches) { enabled = false; onEnabledChange(false); }
    schedule();
  }

  const observer = window.IntersectionObserver ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
    schedule();
  }, { threshold: [0, 0.25] }) : null;
  observer?.observe(carousel);
  carousel.addEventListener("pointerenter", pointerEnter);
  carousel.addEventListener("pointerleave", pointerLeave);
  carousel.addEventListener("focusin", focusIn);
  carousel.addEventListener("focusout", focusOut);
  track.addEventListener("pointerdown", pointerDown);
  track.addEventListener("wheel", schedule, { passive: true });
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);
  document.addEventListener("visibilitychange", schedule);
  motion.addEventListener("change", motionChange);
  onEnabledChange(enabled);
  schedule();

  return {
    reset: schedule,
    toggle() {
      enabled = !enabled;
      // Explicit Play takes precedence over the button's own hover/focus.
      // A later focus or pointer entry pauses the reader again.
      if (enabled) { focused = false; hovering = false; }
      onEnabledChange(enabled);
      schedule();
    },
    cleanup() {
      disposed = true;
      window.clearTimeout(timer);
      observer?.disconnect();
      carousel.removeEventListener("pointerenter", pointerEnter);
      carousel.removeEventListener("pointerleave", pointerLeave);
      carousel.removeEventListener("focusin", focusIn);
      carousel.removeEventListener("focusout", focusOut);
      track.removeEventListener("pointerdown", pointerDown);
      track.removeEventListener("wheel", schedule);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
      document.removeEventListener("visibilitychange", schedule);
      motion.removeEventListener("change", motionChange);
    },
  };
}
