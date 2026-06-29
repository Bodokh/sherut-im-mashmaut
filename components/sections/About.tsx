import { Section, Eyebrow } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";

const avatarTints = [
  "from-brand-400 to-brand-700",
  "from-green-400 to-brand-600",
  "from-brand-500 to-brand-800",
  "from-green-500 to-green-800",
];

export function About({ dict }: { dict: Dictionary }) {
  const t = dict.about;

  return (
    <Section id="about">
      <div className="max-w-3xl" data-reveal>
        <Eyebrow>{t.kicker}</Eyebrow>
        <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
      </div>

      <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {t.members.map((m, i) => (
          <li
            key={i}
            data-reveal
            style={{ ["--reveal-delay" as string]: `${i * 90}ms` }}
            className="group rounded-3xl border border-line bg-surface p-4 transition-all duration-300 ease-out-quart hover:-translate-y-1 hover:border-brand-300/60 hover:shadow-lift"
          >
            <div
              className={`relative grid aspect-[4/5] place-items-center overflow-hidden rounded-2xl bg-gradient-to-br ${avatarTints[i % avatarTints.length]}`}
            >
              <span className="weave absolute inset-0 opacity-40" aria-hidden />
              <span className="font-display text-6xl font-black text-white/95 drop-shadow-sm">
                {m.initials}
              </span>
            </div>
            <div className="px-2 pb-1 pt-4">
              <h3 className="font-display text-xl font-bold text-ink-950">{m.name}</h3>
              <p className="mt-0.5 text-sm font-semibold text-brand-700">{m.role}</p>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-600">{m.bio}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-ink-500">{t.note}</p>
    </Section>
  );
}
