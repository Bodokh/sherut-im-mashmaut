import { CommentsForm } from "@/components/forms/CommentsForm";
import { PrivacyNotice } from "@/components/forms/PrivacyNotice";
import { Section } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import styles from "./Comments.module.css";

export function Comments({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const t = dict.comments;

  return (
    <Section id="comments" className={styles.comments}>
      <div className={styles.layout}>
        <div className={styles.introduction}>
          <p className={styles.label}>{t.kicker}</p>
          <h2>{t.title}</h2>
          <p className={styles.lead}>{t.lead}</p>
        </div>
        <div className={styles.form}>
          <CommentsForm copy={t} locale={locale} privacyNotice={<PrivacyNotice locale={locale} id="comment-privacy-notice" />} />
        </div>
      </div>
    </Section>
  );
}
