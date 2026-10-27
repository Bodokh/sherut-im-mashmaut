import { CommentsForm } from "@/components/forms/CommentsForm";
import { PrivacyNotice } from "@/components/forms/PrivacyNotice";
import { Eyebrow, Section } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

export function Comments({ dict, locale }: { dict: Dictionary; locale: Locale }) {
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
          <CommentsForm copy={t} locale={locale} privacyNotice={<PrivacyNotice locale={locale} id="comment-privacy-notice" />} />
        </div>
      </div>
    </Section>
  );
}
