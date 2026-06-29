"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { LangToggle } from "./LangToggle";
import { cn } from "@/lib/cn";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

const SECTIONS = ["about", "stories", "field", "events", "support", "partners", "contact"] as const;

const SCROLL_FADE_END = 72;

export function Header({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const [bgOpacity, setBgOpacity] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setBgOpacity(Math.min(window.scrollY / SCROLL_FADE_END, 1));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const surfaceOpacity = open ? 1 : bgOpacity;
  const showSurface = surfaceOpacity > 0;

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const links = SECTIONS.map((id) => ({ id, label: dict.nav[id], href: `#${id}` }));

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-[200] border-b transition-[border-color,box-shadow] duration-300 ease-out-quart",
        showSurface ? "border-line shadow-soft" : "border-transparent shadow-none",
      )}
      style={{ backgroundColor: `rgb(255 255 255 / ${surfaceOpacity})` }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:inset-inline-start-4 focus:top-3 focus:z-[300] focus:rounded-full focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {dict.a11y.skip}
      </a>

      <div className="shell flex h-[var(--header-h)] items-center justify-between gap-3">
        <Link
          href={`/${locale}`}
          aria-label={dict.brand.name}
          className="shrink-0 rounded-lg text-ink-950 transition-opacity inline-flex hover:opacity-85"
        >
          <Logo name={dict.brand.name} />
        </Link>

        <nav aria-label={dict.a11y.menu} className="hidden items-center gap-0.5 xl:flex">
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
              label={dict.langName}
              a11yLabel={dict.a11y.langSwitch}
              className="text-ink-700 hover:bg-brand-50 hover:text-brand-800"
            />
            <Button href="#donate" variant="give">
              {dict.nav.donate}
            </Button>
          </div>

          <button
            type="button"
            aria-label={open ? dict.a11y.closeMenu : dict.a11y.openMenu}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
            className="grid h-11 w-11 place-items-center rounded-full text-ink-900 transition-colors hover:bg-brand-50 xl:hidden"
          >
            <span className="relative block h-4 w-5" aria-hidden="true">
              <span
                className={cn(
                  "absolute inset-x-0 top-0 h-0.5 rounded-full bg-current transition-transform duration-300 ease-out-quart",
                  open && "translate-y-[7px] rotate-45",
                )}
              />
              <span
                className={cn(
                  "absolute inset-x-0 top-[7px] h-0.5 rounded-full bg-current transition-opacity duration-200",
                  open && "opacity-0",
                )}
              />
              <span
                className={cn(
                  "absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-current transition-transform duration-300 ease-out-quart",
                  open && "-translate-y-[7px] -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label={dict.a11y.menu}
        className={cn(
          "fixed inset-x-0 top-[var(--header-h)] h-[calc(100dvh-var(--header-h))] z-[190] origin-top bg-paper backdrop-blur-md transition-[opacity,transform] duration-300 ease-out-quart xl:hidden",
          open ? "visible opacity-100" : "invisible -translate-y-2 opacity-0",
        )}
      >
        <nav className="shell flex h-[calc(100dvh-var(--header-h))] flex-col gap-1 overflow-y-auto py-8">
          {links.map((l, i) => (
            <a
              key={l.id}
              href={l.href}
              onClick={() => setOpen(false)}
              style={{ transitionDelay: open ? `${60 + i * 35}ms` : "0ms" }}
              className={cn(
                "border-b border-line/70 py-4 font-display text-2xl font-bold text-ink-900 transition-all duration-300 hover:text-brand-700",
                open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
              )}
            >
              {l.label}
            </a>
          ))}
          <div className="mt-6 flex items-center gap-3">
            <Button href="#donate" variant="give" size="lg" arrow onClick={() => setOpen(false)} className="flex-1">
              {dict.nav.donate}
            </Button>
            <LangToggle
              locale={locale}
              label={dict.langName}
              a11yLabel={dict.a11y.langSwitch}
              className="min-h-12 border border-line text-ink-800"
            />
          </div>
        </nav>
      </div>
    </header>
  );
}
