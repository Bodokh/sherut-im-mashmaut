import Image from "next/image";
import { cn } from "@/lib/cn";

export function StoryCard({
  id,
  poster,
  alt,
  tag,
  title,
  excerpt,
  duration,
  videoUrl,
  soon,
  contactLabel,
  playLabel,
  className,
}: {
  id: string;
  poster: string;
  alt: string;
  tag: string;
  title: string;
  excerpt: string;
  duration: string;
  videoUrl?: string;
  soon: string;
  contactLabel: string;
  playLabel: string;
  className?: string;
}) {
  const dialogId = `${id}-dialog`;

  return (
    <>
      <a
        href={`#${dialogId}`}
        aria-label={`${playLabel}: ${title}`}
        className={cn(
          "group block w-full text-start focus-visible:outline-offset-4",
          className,
        )}
      >
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl shadow-soft ring-1 ring-brand-950/5">
          <Image
            src={poster}
            alt={alt}
            fill
            sizes="(max-width: 768px) 92vw, (max-width: 1024px) 46vw, 30vw"
            className="object-cover transition-transform duration-[1.1s] ease-out-quart group-hover:scale-[1.06]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-950/75 via-brand-950/10 to-transparent" />

          <span className="absolute inset-inline-start-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-brand-800 backdrop-blur-sm">
            {tag}
          </span>

          <span className="absolute inset-0 flex items-center justify-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/95 text-brand-800 shadow-lift transition-transform duration-300 ease-out-quart group-hover:scale-110">
              <svg viewBox="0 0 24 24" className="ms-0.5 h-6 w-6" fill="currentColor" aria-hidden="true">
                <path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10.2-6.8a1 1 0 0 0 0-1.6L9.6 4.4c-.7-.5-1.6 0-1.6.8Z" />
              </svg>
            </span>
          </span>

          <span className="absolute inset-inline-end-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-brand-950/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm tabular-nums">
            {duration}
          </span>
        </div>

        <h3 className="mt-4 font-display text-xl font-bold text-ink-950 transition-colors group-hover:text-brand-700">
          {title}
        </h3>
        <p className="mt-1.5 leading-relaxed text-ink-600">{excerpt}</p>
      </a>

      <div
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="pointer-events-none fixed inset-0 z-[400] flex items-center justify-center bg-brand-950/80 p-4 opacity-0 backdrop-blur-sm transition-opacity target:pointer-events-auto target:opacity-100"
      >
        <a href="#stories" aria-label={contactLabel} className="absolute inset-0" />
        <div
          className="relative w-full max-w-md overflow-hidden rounded-3xl bg-paper p-8 text-center shadow-lift"
        >
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-brand-700">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10.2-6.8a1 1 0 0 0 0-1.6L9.6 4.4c-.7-.5-1.6 0-1.6.8Z" />
            </svg>
          </div>
          <p className="mt-5 font-display text-2xl font-bold leading-tight text-ink-950">{title}</p>
          <p className="mt-2 leading-relaxed text-ink-600">{soon}</p>
          {videoUrl ? (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-brand-700 px-6 font-semibold text-white transition-colors hover:bg-brand-800"
            >
              {playLabel}
            </a>
          ) : (
            <a
              href="#contact"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-brand-700 px-6 font-semibold text-white transition-colors hover:bg-brand-800"
            >
              {contactLabel}
            </a>
          )}
        </div>
      </div>
    </>
  );
}
