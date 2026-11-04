import { HomeFilmPlayer } from "@/components/ui/HomeFilmPlayer";
import { localizedPath } from "@/lib/routes";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import styles from "./Hero.module.css";
import { media } from "@/lib/media";

export function Hero({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.hero;
  const lines = t.title.split("\n");

  return (
    <section id="top" className={styles.hero} data-theme="dark">
      <div className={styles.film}>
        <HomeFilmPlayer
          src="/media/home-film/sherut-im-mashmaut.da4289b5a150.mp4"
          poster={media.homeFilmPoster}
          title={t.watch}
          closeLabel={dict.videosPage.close}
          labels={t.player}
          duration={t.watchNote}
        />
      </div>
      <div className={styles.stage}>
        <div className={styles.copy}>
          <p className={styles.intro}>{t.kicker}</p>
          <h1 className={styles.title}>
            <span>{lines[0]}</span>
            {lines[1] ? <span>{lines[1]}</span> : null}
          </h1>
          <p className={styles.lead}>{t.lead}</p>
          <div className={styles.actions}>
            <a href={localizedPath(locale, "contact")} className={styles.primary}>
              {t.ctaPrimary}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M4 12h16m-6-6 6 6-6 6" />
              </svg>
            </a>
            <a href="#about" className={styles.secondary}>{t.ctaSecondary}</a>
          </div>
        </div>
      </div>
      <div className={styles.base}>
        <ul className={styles.values} aria-label={dict.brand.tagline}>
          {t.values.map((value) => <li key={value}>{value}</li>)}
        </ul>
        <a href="#about" className={styles.scroll}>
          {t.scroll}
          <svg viewBox="0 0 16 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M8 1v20m-6-6 6 6 6-6" />
          </svg>
        </a>
      </div>
    </section>
  );
}
