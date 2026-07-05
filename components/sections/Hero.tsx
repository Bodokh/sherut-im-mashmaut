import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Section";
import { VideoFacade } from "@/components/ui/VideoFacade";
import { media } from "@/lib/media";
import type { Dictionary } from "@/i18n/dictionaries";

export function Hero({ dict }: { dict: Dictionary }) {
  const t = dict.hero;
  const lines = t.title.split("\n");
  const values = [...t.values, ...t.values];

  return (
    <section id="top" className="relative overflow-hidden pt-[calc(var(--header-h)+2rem)]">
      {/* atmosphere */}
      <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-10 opacity-90" />
      <div
        aria-hidden
        className="float-slow pointer-events-none absolute -z-10 hidden h-72 w-72 rounded-full bg-green-300/30 blur-3xl md:block"
        style={{ insetInlineStart: "-4rem", top: "38%" }}
      />

      <div className="shell grid items-center gap-12 pb-16 lg:grid-cols-12 lg:gap-8 lg:pb-24">
        {/* Text */}
        <div className="lg:col-span-7 xl:col-span-6">
          <div>
            <Eyebrow>{t.kicker}</Eyebrow>
          </div>

          <h1
            className="mt-5 text-pretty text-[clamp(2.35rem,4.6vw+0.5rem,4.5rem)] font-black leading-[1.04]"
          >
            <span className="block text-ink-950">{lines[0]}</span>
            {lines[1] ? <span className="block text-brand-700">{lines[1]}</span> : null}
          </h1>

          <p
            className="mt-6 max-w-[46ch] text-lg leading-relaxed text-ink-700 sm:text-xl"
          >
            {t.lead}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button href="#contact" variant="primary" size="lg" arrow>
              {t.ctaPrimary}
            </Button>
            <Button href="#about" variant="outline" size="lg">
              {t.ctaSecondary}
            </Button>
          </div>
        </div>

        {/* Video */}
        <div className="hidden lg:col-span-5 lg:block xl:col-span-6">
          <div className="relative mx-auto max-w-[640px]">
            {/* glow plate behind the video */}
            <div
              aria-hidden
              className="absolute -inset-3 -z-10 rounded-[2rem] bg-brand-500/15 blur-2xl"
            />
            <VideoFacade
              poster={media.heroPoster}
              playLabel={dict.a11y.playFilm}
              watchLabel={t.watch}
              note={t.watchNote}
              posterAlt={dict.meta.ogAlt}
            />
          </div>
        </div>
      </div>

      {/* Values marquee — a quiet transition band */}
      <div className="border-y border-line bg-surface/70 py-4">
        <div className="marquee">
          <ul className="marquee-track items-center gap-0 text-ink-500">
            {values.map((v, i) => (
              <li key={i} className="flex items-center gap-8 px-8">
                <span className="font-display text-xl font-bold tracking-tight text-ink-700">{v}</span>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green-500" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
