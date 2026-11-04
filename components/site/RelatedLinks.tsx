import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath, type SiteRouteKey } from "@/lib/routes";
import styles from "./RelatedLinks.module.css";

export function RelatedLinks({
  locale,
  dict,
  routes,
}: {
  locale: Locale;
  dict: Dictionary;
  routes: SiteRouteKey[];
}) {
  return (
    <nav aria-labelledby="related-pages-title" className={styles.related}>
      <h2 id="related-pages-title">
        {dict.pageCommon.relatedTitle}
      </h2>
      <ul>
        {routes.map((route) => (
          <li key={route}>
            <Link
              href={localizedPath(locale, route)}
              className={styles.link}
            >
              {dict.routeLabels[route]}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
