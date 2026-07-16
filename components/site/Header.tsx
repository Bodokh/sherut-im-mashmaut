import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { LangToggle } from "./LangToggle";
import { UserWayAccessibilityTrigger } from "./UserWayAccessibilityTrigger";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath, type SiteRouteKey } from "@/lib/routes";

const PRIMARY_ROUTES = ["lectures", "guidance", "getInvolved", "faq", "contact"] as const;

type HeaderNavKey =
  | (typeof PRIMARY_ROUTES)[number]
  | "team"
  | "vision"
  | "partners"
  | "stories"
  | "about"
  | "donate";

export type HeaderCopy = {
  brandName: string;
  langName: string;
  nav: Pick<Dictionary["nav"], HeaderNavKey>;
  a11y: Pick<
    Dictionary["a11y"],
    | "skip"
    | "openMenu"
    | "closeMenu"
    | "menu"
    | "aboutMenu"
    | "langSwitch"
    | "accessibilityMenu"
  >;
};

export function buildHeaderCopy(dict: Dictionary): HeaderCopy {
  return {
    brandName: dict.brand.name,
    langName: dict.langName,
    nav: {
      about: dict.nav.about,
      team: dict.nav.team,
      vision: dict.nav.vision,
      partners: dict.nav.partners,
      stories: dict.nav.stories,
      contact: dict.nav.contact,
      donate: dict.nav.donate,
      lectures: dict.nav.lectures,
      guidance: dict.nav.guidance,
      getInvolved: dict.nav.getInvolved,
      faq: dict.nav.faq,
    },
    a11y: {
      skip: dict.a11y.skip,
      openMenu: dict.a11y.openMenu,
      closeMenu: dict.a11y.closeMenu,
      menu: dict.a11y.menu,
      aboutMenu: dict.a11y.aboutMenu,
      langSwitch: dict.a11y.langSwitch,
      accessibilityMenu: dict.a11y.accessibilityMenu,
    },
  };
}

function aboutLinks(locale: Locale, nav: HeaderCopy["nav"]) {
  return [
    { id: "team", label: nav.team, href: localizedPath(locale, "team") },
    { id: "vision", label: nav.vision, href: `${localizedPath(locale, "home")}#manifesto` },
    { id: "stories", label: nav.stories, href: `${localizedPath(locale, "home")}#stories` },
    { id: "partners", label: nav.partners, href: `${localizedPath(locale, "home")}#partners` },
  ];
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 opacity-70 transition-transform duration-200 ease-out-quart group-hover:rotate-180 group-focus-within:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Header({
  locale,
  currentRoute,
  copy,
}: {
  locale: Locale;
  currentRoute: SiteRouteKey;
  copy: HeaderCopy;
}) {
  const links = PRIMARY_ROUTES.map((id) => ({
    id,
    label: copy.nav[id],
    href: localizedPath(locale, id),
  }));
  const about = aboutLinks(locale, copy.nav);

  return (
    <header className="fixed inset-x-0 top-0 z-[200] border-b border-line/80 bg-paper/90 shadow-soft backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:inset-inline-start-4 focus:top-3 focus:z-[300] focus:rounded-full focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {copy.a11y.skip}
      </a>

      <div className="shell flex h-[var(--header-h)] items-center justify-between gap-3">
        <Link
          href={localizedPath(locale, "home")}
          aria-label={copy.brandName}
          className="inline-flex shrink-0 rounded-lg text-ink-950 transition-opacity hover:opacity-85"
        >
          <Logo name={copy.brandName} />
        </Link>

        <nav aria-label={copy.a11y.menu} className="hidden items-center gap-0.5 xl:flex">
          <div className="group relative">
            <Link
              href={`${localizedPath(locale, "home")}#about`}
              aria-haspopup="true"
              aria-current={currentRoute === "team" ? "page" : undefined}
              className="inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[0.95rem] font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
            >
              {copy.nav.about}
              <Chevron />
            </Link>
            <div
              role="group"
              aria-label={copy.a11y.aboutMenu}
              className="invisible absolute inset-inline-start-0 top-full w-56 translate-y-1 pt-2 opacity-0 transition-[opacity,transform,visibility] duration-200 ease-out-quart group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100"
            >
              <ul className="rounded-2xl border border-line bg-paper p-2 shadow-lift">
                {about.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.href}
                      className="block rounded-xl px-3.5 py-2.5 text-[0.95rem] font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {links.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              aria-current={currentRoute === link.id ? "page" : undefined}
              className="rounded-full px-3.5 py-2 text-[0.95rem] font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <UserWayAccessibilityTrigger label={copy.a11y.accessibilityMenu} />

          <div className="hidden items-center gap-1.5 sm:flex">
            <LangToggle
              locale={locale}
              label={copy.langName}
              a11yLabel={copy.a11y.langSwitch}
              currentRoute={currentRoute}
              className="text-ink-700 hover:bg-brand-50 hover:text-brand-800"
            />
            <Button href={localizedPath(locale, "getInvolved")} variant="give">
              {copy.nav.donate}
            </Button>
          </div>

          <a
            href="#mobile-menu"
            aria-label={copy.a11y.openMenu}
            className="grid h-11 w-11 place-items-center rounded-full text-ink-900 transition-colors hover:bg-brand-50 xl:hidden"
          >
            <span className="relative block h-4 w-5" aria-hidden="true">
              <span className="absolute inset-x-0 top-0 h-0.5 rounded-full bg-current" />
              <span className="absolute inset-x-0 top-[7px] h-0.5 rounded-full bg-current" />
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-current" />
            </span>
          </a>
        </div>
      </div>

      <div
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label={copy.a11y.menu}
        className="pointer-events-none invisible fixed inset-x-0 top-[var(--header-h)] z-[190] h-[calc(100dvh-var(--header-h))] origin-top -translate-y-2 bg-paper opacity-0 backdrop-blur-md transition-[opacity,transform,visibility] duration-300 ease-out-quart target:pointer-events-auto target:visible target:translate-y-0 target:opacity-100 xl:hidden"
      >
        <nav className="shell flex h-[calc(100dvh-var(--header-h))] flex-col gap-1 overflow-y-auto py-8">
          <a
            href="#close-menu"
            aria-label={copy.a11y.closeMenu}
            className="mb-3 ms-auto grid h-11 w-11 place-items-center rounded-full text-ink-900 transition-colors hover:bg-brand-50"
          >
            <span className="relative block h-5 w-5" aria-hidden="true">
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rotate-45 rounded-full bg-current" />
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
            </span>
          </a>

          <p className="border-b border-line/70 py-4 font-display text-2xl font-bold text-ink-900">
            {copy.nav.about}
          </p>
          <ul className="border-b border-line/70 pb-4 pt-1">
            {about.map((link) => (
              <li key={link.id}>
                <Link
                  href={link.href}
                  className="block py-2.5 ps-4 text-lg font-semibold text-ink-700 transition-colors hover:text-brand-700"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {links.map((link, index) => (
            <Link
              key={link.id}
              href={link.href}
              aria-current={currentRoute === link.id ? "page" : undefined}
              style={{ transitionDelay: `${60 + index * 35}ms` }}
              className="border-b border-line/70 py-4 font-display text-2xl font-bold text-ink-900 transition-colors duration-300 hover:text-brand-700"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-6 flex items-center gap-3">
            <Button href={localizedPath(locale, "getInvolved")} variant="give" size="lg" arrow className="flex-1">
              {copy.nav.donate}
            </Button>
            <LangToggle
              locale={locale}
              label={copy.langName}
              a11yLabel={copy.a11y.langSwitch}
              currentRoute={currentRoute}
              className="min-h-12 border border-line text-ink-800"
            />
          </div>
        </nav>
      </div>
    </header>
  );
}
