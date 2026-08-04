import { Section, Eyebrow } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";

export function About({ dict }: { dict: Dictionary }) {
  const t = dict.about;

  return (
    <Section id="about">
      <div className="max-w-3xl" data-reveal="move">
        <Eyebrow>{t.kicker}</Eyebrow>
        <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
      </div>
    </Section>
  );
}
