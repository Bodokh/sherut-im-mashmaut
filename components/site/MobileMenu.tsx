"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./MobileMenu.module.css";

export function MobileMenu({
  openLabel,
  closeLabel,
  menuLabel,
  children,
}: {
  openLabel: string;
  closeLabel: string;
  menuLabel: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const [open, setOpen] = useState(false);

  const unlockScroll = useCallback(() => {
    if (previousOverflow.current === null) return;
    document.documentElement.style.overflow = previousOverflow.current;
    previousOverflow.current = null;
  }, []);

  const closeMenu = useCallback(() => {
    dialog.current?.close();
    unlockScroll();
    setOpen(false);
  }, [unlockScroll]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    function closeOnDesktop() {
      if (desktop.matches) closeMenu();
    }
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      unlockScroll();
    };
  }, [closeMenu, unlockScroll]);

  function openMenu() {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    previousOverflow.current = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    setOpen(true);
  }

  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-label={openLabel}
        aria-haspopup="dialog"
        aria-controls="mobile-menu"
        aria-expanded={open}
        className={styles.opener}
        onClick={openMenu}
      >
        <span className={styles.hamburger} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <dialog
        ref={dialog}
        id="mobile-menu"
        aria-label={menuLabel}
        className={styles.dialog}
        onClose={() => {
          unlockScroll();
          setOpen(false);
          if (opener.current?.getClientRects().length) opener.current.focus({ preventScroll: true });
        }}
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest("a[href]")) closeMenu();
        }}
      >
        <nav aria-label={menuLabel} className={`shell ${styles.navigation}`}>
          <button
            type="button"
            aria-label={closeLabel}
            className={styles.close}
            onClick={closeMenu}
          >
            <span aria-hidden="true" />
          </button>
          {children}
        </nav>
      </dialog>
    </>
  );
}
