import Image from "next/image";
import { cn } from "@/lib/cn";

export function VideoFacade({
  poster,
  posterAlt,
  videoUrl,
  playLabel,
  watchLabel,
  note,
  fallbackHref = "#stories",
  className,
  priority,
}: {
  poster?: string;
  posterAlt?: string;
  videoUrl?: string;
  playLabel: string;
  watchLabel: string;
  note?: string;
  fallbackHref?: string;
  className?: string;
  priority?: boolean;
}) {
  const PlayButton = (
    <span className="relative inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-white/25 transition-transform duration-500 ease-out-quart group-hover:scale-110" />
      <span className="absolute inset-0 animate-ping rounded-full bg-white/20 [animation-duration:2.8s] motion-reduce:hidden" />
      <span className="relative inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-white text-brand-800 shadow-lift">
        <svg viewBox="0 0 24 24" className="ms-1 h-7 w-7" fill="currentColor" aria-hidden="true">
          <path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10.2-6.8a1 1 0 0 0 0-1.6L9.6 4.4c-.7-.5-1.6 0-1.6.8Z" />
        </svg>
      </span>
    </span>
  );

  return (
    <>
      <div
        className={cn(
          "group relative aspect-video w-full overflow-hidden rounded-[1.75rem] shadow-glow ring-1 ring-brand-950/10",
          className,
        )}
      >
        {poster ? (
          <Image
            src={poster}
            alt={posterAlt ?? ""}
            fill
            preload={priority}
            fetchPriority={priority ? "high" : undefined}
            decoding={priority ? "sync" : "async"}
            unoptimized={poster.startsWith("/")}
            sizes="(max-width: 1024px) 92vw, 620px"
            className="object-cover transition-transform duration-[1.2s] ease-out-quart group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 aurora-techelet bg-brand-900">
            <div className="weave absolute inset-0 opacity-60" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-brand-950/70 via-brand-950/15 to-brand-950/5" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_oklch(0.20_0.07_262/0.40),_transparent_58%)]" />

        <a
          href={videoUrl ?? fallbackHref}
          target={videoUrl ? "_blank" : undefined}
          rel={videoUrl ? "noopener noreferrer" : undefined}
          aria-label={playLabel}
          className="absolute inset-0 flex items-center justify-center focus-visible:outline-offset-[-6px]"
        >
          {PlayButton}
        </a>

        <div className="pointer-events-none absolute inset-inline-start-0 bottom-0 flex w-full items-end justify-between gap-3 p-5">
          <span className="font-display text-lg font-bold text-white drop-shadow-sm">{watchLabel}</span>
          {note ? (
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {note}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
