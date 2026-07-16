import { Section } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";

export function Manifesto({ dict }: { dict: Dictionary }) {
  const t = dict.manifesto;

  return (
    <Section id="manifesto" tone="navy" className="overflow-hidden">
      <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-0 opacity-40" />
      <div aria-hidden className="weave pointer-events-none absolute inset-0 -z-0 opacity-60" />

      <div className="relative mx-auto max-w-4xl text-center">
        <p className="text-sm font-semibold tracking-wide text-brand-200" data-reveal="fade">
          {t.kicker}
        </p>

        <h2
          data-reveal
          className="mt-6 text-balance text-[clamp(2rem,4.6vw,3.75rem)] font-bold leading-[1.08] text-white"
        >
          {t.lines.map((line) => <span key={line} className="block">{line}</span>)}
        </h2>

        <p
          className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-brand-100"
          data-reveal
          style={{ ["--reveal-delay" as string]: "200ms" }}
        >
          {t.body}
        </p>
      </div>

      <ul className="relative mx-auto mt-16 grid max-w-5xl gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {t.pillars.map((p, i) => (
          <li
            key={i}
            data-reveal
            style={{ ["--reveal-delay" as string]: `${i * 110}ms` }}
            className="border-t border-white/15 pt-5"
          >
            <span aria-hidden className="mb-3 block h-2 w-2 rounded-full bg-green-400" />
            <h3 className="font-display text-2xl font-bold text-white">{p.title}</h3>
            <p className="mt-2 leading-relaxed text-brand-200">{p.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
