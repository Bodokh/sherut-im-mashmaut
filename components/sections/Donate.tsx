import { Section } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";

export function Donate({ dict }: { dict: Dictionary }) {
  const t = dict.donate;

  return (
    <Section id="donate" tone="give" className="overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(70%_90%_at_80%_-10%,_oklch(0.75_0.14_150/0.55),_transparent_60%)]"
      />
      <div aria-hidden className="weave pointer-events-none absolute inset-0 -z-0 opacity-50" />

      <div className="relative mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold tracking-wide text-green-100" data-reveal="fade">
          {t.kicker}
        </p>
        <h2
          className="mt-5 whitespace-pre-line text-balance text-[clamp(2.1rem,4.4vw,3.6rem)] font-bold leading-[1.07] text-white"
          data-reveal
        >
          {t.title}
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-green-50" data-reveal style={{ ["--reveal-delay" as string]: "100ms" }}>
          {t.lead}
        </p>

        {/* Amount chips */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3" data-reveal style={{ ["--reveal-delay" as string]: "160ms" }}>
          {t.amounts.map((amount) => (
            <a
              key={amount}
              href="#donate"
              className="min-w-20 rounded-full border border-white/35 px-5 py-2.5 font-display text-lg font-bold text-white transition-colors hover:bg-white hover:text-green-800"
            >
              <span dir="ltr">{t.currency}{amount}</span>
            </a>
          ))}
        </div>
        <p className="mt-4 text-sm text-green-100/90" data-reveal>{t.amountsNote}</p>

        <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row" data-reveal style={{ ["--reveal-delay" as string]: "120ms" }}>
          <a
            href="#donate"
            className="group inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-semibold text-green-800 shadow-lift transition-all duration-200 ease-out-quart hover:scale-[1.02] active:scale-[0.98]"
          >
            {t.cta}
            <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#contact" className="font-semibold text-white/90 underline-offset-4 hover:text-white hover:underline">
            {t.otherWays}
          </a>
        </div>
      </div>
    </Section>
  );
}
