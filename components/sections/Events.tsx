import { Section, Eyebrow } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import type { Dictionary } from "@/i18n/dictionaries";

export function Events({ dict }: { dict: Dictionary }) {
  const t = dict.events;

  return (
    <Section id="events" tone="surface">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5" data-reveal>
          <Eyebrow>{t.kicker}</Eyebrow>
          <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
          <Button href="#contact" variant="primary" size="lg" arrow className="mt-7">
            {t.cta}
          </Button>
        </div>

        <ul className="space-y-4 lg:col-span-7">
          {t.items.map((ev, i) => (
            <li
              key={i}
              data-reveal
              style={{ ["--reveal-delay" as string]: `${i * 100}ms` }}
              className="group flex flex-col gap-5 rounded-3xl border border-line bg-paper p-5 transition-all duration-300 ease-out-quart hover:-translate-y-0.5 hover:shadow-lift sm:flex-row sm:items-center sm:p-6"
            >
              <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-brand-700 text-white">
                <span className="font-display text-4xl font-black leading-none tabular-nums">{ev.day}</span>
                <span className="mt-1 text-sm font-semibold text-brand-100">{ev.month}</span>
              </div>
              <div className="flex-1">
                <h3 className="font-display text-xl font-bold text-ink-950">{ev.title}</h3>
                <p className="mt-1 text-sm font-semibold text-brand-700">{ev.location}</p>
                <p className="mt-1.5 leading-relaxed text-ink-600">{ev.excerpt}</p>
              </div>
              <a
                href="#contact"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-brand-700/25 px-5 font-semibold text-brand-800 transition-colors hover:bg-brand-50"
              >
                {t.register}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
