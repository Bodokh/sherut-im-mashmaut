import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath, type SiteRouteKey } from "@/lib/routes";

export function Breadcrumbs({
  locale,
  route,
  dict,
}: {
  locale: Locale;
  route: Exclude<SiteRouteKey, "home">;
  dict: Dictionary;
}) {
  return (
    <nav aria-label={dict.pageCommon.breadcrumbsLabel} className="mb-8 text-sm text-ink-600">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link className="font-semibold text-brand-700 hover:text-brand-900" href={localizedPath(locale, "home")}>
            {dict.routeLabels.home}
          </Link>
        </li>
        <li aria-hidden="true" className="text-ink-400 rtl:-scale-x-100">/</li>
        <li aria-current="page" className="text-ink-700">{dict.routeLabels[route]}</li>
      </ol>
    </nav>
  );
}
