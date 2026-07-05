import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { LangToggle } from "./LangToggle";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

const SECTIONS = ["about", "stories", "field", "events", "support", "partners", "contact"] as const;

type HeaderNavKey = (typeof SECTIONS)[number] | "donate";

export type HeaderCopy = {
  brandName: string;
  langName: string;
  nav: Pick<Dictionary["nav"], HeaderNavKey>;
  a11y: Pick<Dictionary["a11y"], "skip" | "openMenu" | "closeMenu" | "menu" | "langSwitch">;
};

export function Header({ locale, copy }: { locale: Locale; copy: HeaderCopy }) {
  const links = SECTIONS.map((id) => ({ id, label: copy.nav[id], href: `#${id}` }));

  return (
    <header className="fixed inset-x-0 top-0 z-[200] border-b border-line/80 bg-paper/90 shadow-soft backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:inset-inline-start-4 focus:top-3 focus:z-[300] focus:rounded-full focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {copy.a11y.skip}
      </a>

      <div className="shell flex h-[var(--header-h)] items-center justify-between gap-3">
        <a
          href={`/${locale}`}
          aria-label={copy.brandName}
          className="shrink-0 rounded-lg text-ink-950 transition-opacity inline-flex hover:opacity-85"
        >
          <Logo name={copy.brandName} />
        </a>

        <nav aria-label={copy.a11y.menu} className="hidden items-center gap-0.5 xl:flex">
          {links.map((l) => (
            <a
              key={l.id}
              href={l.href}
              className="rounded-full px-3.5 py-2 text-[0.95rem] font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <div className="hidden items-center gap-1.5 sm:flex">
            <LangToggle
              locale={locale}
              label={copy.langName}
              a11yLabel={copy.a11y.langSwitch}
              className="text-ink-700 hover:bg-brand-50 hover:text-brand-800"
            />
            <Button href="#donate" variant="give">
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

      {/* Mobile menu */}
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
          {links.map((l, i) => (
            <a
              key={l.id}
              href={l.href}
              style={{ transitionDelay: `${60 + i * 35}ms` }}
              className="border-b border-line/70 py-4 font-display text-2xl font-bold text-ink-900 transition-colors duration-300 hover:text-brand-700"
            >
              {l.label}
            </a>
          ))}
          <div className="mt-6 flex items-center gap-3">
            <Button href="#donate" variant="give" size="lg" arrow className="flex-1">
              {copy.nav.donate}
            </Button>
            <LangToggle
              locale={locale}
              label={copy.langName}
              a11yLabel={copy.a11y.langSwitch}
              className="min-h-12 border border-line text-ink-800"
            />
          </div>
        </nav>
      </div>
    </header>
  );
}
