import { CommentsForm } from "@/components/forms/CommentsForm";
import { Eyebrow, Section } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";

export function Comments({ dict }: { dict: Dictionary }) {
  const t = dict.comments;

  return (
    <Section id="comments">
      <div className="mx-auto max-w-2xl" data-reveal>
        <div className="text-center">
          <Eyebrow className="justify-center">{t.kicker}</Eyebrow>
          <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
        </div>
        <div className="mt-10">
          <CommentsForm copy={t} />
        </div>
      </div>
    </Section>
  );
}
