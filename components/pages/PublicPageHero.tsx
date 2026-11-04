import type { ReactNode } from "react";
import Image from "next/image";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { SiteRouteKey } from "@/lib/routes";
import styles from "./PublicPageHero.module.css";

/** Shared visual frame. Each page supplies its own content and composition. */
export function PublicPageHero({ locale, route, dict, title, lead, kicker, image, imagePosition = "center", compact = false, children }: {
  locale: Locale;
  route: Exclude<SiteRouteKey, "home">;
  dict: Dictionary;
  title: string;
  lead?: string;
  kicker?: string;
  image?: string;
  imagePosition?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={`${styles.hero} ${compact ? styles.compact : ""} ${image ? styles.photographic : ""}`} data-theme="dark">
      {image ? <>
        <Image src={image} alt="" fill loading="eager" fetchPriority="high" sizes="100vw" className={styles.image} style={{ objectPosition: imagePosition }} />
        <div className={styles.shade} aria-hidden="true" />
      </> : null}
      <div className={`shell ${styles.inner}`}>
        <div className={styles.breadcrumbs}><Breadcrumbs locale={locale} route={route} dict={dict} /></div>
        <div className={styles.content}>
          {kicker ? <p className={styles.kicker}>{kicker}</p> : null}
          <h1>{title}</h1>
          {lead ? <p className={styles.lead}>{lead}</p> : null}
          {children ? <div className={styles.actions}>{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
