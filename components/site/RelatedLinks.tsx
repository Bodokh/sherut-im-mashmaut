import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath, type SiteRouteKey } from "@/lib/routes";

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
    <nav aria-labelledby="related-pages-title" className="border-t border-line pt-8">
      <h2 id="related-pages-title" className="text-xl font-bold text-ink-950">
        {dict.pageCommon.relatedTitle}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-3">
        {routes.map((route) => (
          <li key={route}>
            <Link
              href={localizedPath(locale, route)}
              className="inline-flex min-h-11 items-center rounded-full border border-brand-200 bg-brand-50 px-5 font-semibold text-brand-800 transition-colors hover:border-brand-400 hover:bg-brand-100"
            >
              {dict.routeLabels[route]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
