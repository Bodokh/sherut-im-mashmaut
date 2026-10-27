"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./login-scene.module.css";

/** An atmospheric, decorative introduction to the mentoring space. */
export function LoginScene() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 801px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const allowed = desktop.matches && !reduced.matches && document.visibilityState === "visible";
      setMotionAllowed(allowed);
      if (!allowed) {
        sceneRef.current?.style.setProperty("--pointer-x", "0px");
        sceneRef.current?.style.setProperty("--pointer-y", "0px");
      }
    };
    update();
    desktop.addEventListener("change", update);
    reduced.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      desktop.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const resetPointer = () => {
    sceneRef.current?.style.setProperty("--pointer-x", "0px");
    sceneRef.current?.style.setProperty("--pointer-y", "0px");
  };

  return (
    <div
      ref={sceneRef}
      className={styles.scene}
      dir="rtl"
      data-running={motionAllowed && !paused}
      onPointerMove={(event) => {
        if (!motionAllowed || paused || event.pointerType !== "mouse") return;
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--pointer-x", `${((event.clientX - rect.left) / rect.width - 0.5) * 16}px`);
        event.currentTarget.style.setProperty("--pointer-y", `${((event.clientY - rect.top) / rect.height - 0.5) * 16}px`);
      }}
      onPointerLeave={resetPointer}
    >
      <div className={styles.texture} aria-hidden="true" />
      <header className={styles.brand}>
        <span className={styles.brandIcon} aria-hidden="true">
          <svg viewBox="0 0 44 44" fill="none"><path d="M22 16.7c-1.7-3-6.2-2.1-6.2 1.3 0 2.7 3.2 5 6.2 7.3 3-2.3 6.2-4.6 6.2-7.3 0-3.4-4.5-4.3-6.2-1.3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M10 23.2c3.1-.9 4.9.1 7.2 2l2.4 1.8h5l3.8-2.4c1.8-1.1 4.1-.5 4.5 1.1l-8.1 5.5c-1 .7-2.3.8-3.5.4l-5.6-1.9H10m24-6.5v8.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
        <span><strong>שירות עם משמעות</strong><small>מרחב הליווי של הצוות</small></span>
      </header>

      <div className={styles.message}>
        <p className={styles.eyebrow}><span /> ביחד, לאורך הדרך</p>
        <h2>כל קשר קטן.<br /><span>משמעות גדולה.</span></h2>
        <p className={styles.intro}>מקום אחד לכל הרגעים שעושים את ההבדל.</p>
      </div>

      <div className={styles.art} aria-hidden="true">
        <div className={styles.artInner}>
          <div className={styles.aura} />
          <svg className={styles.constellation} viewBox="0 0 700 430" fill="none">
            <defs>
              <linearGradient id="scene-thread" x1="78" y1="337" x2="606" y2="79" gradientUnits="userSpaceOnUse"><stop stopColor="#81C7FF" stopOpacity=".12"/><stop offset=".5" stopColor="#C6E9FF" stopOpacity=".85"/><stop offset="1" stopColor="#B2F5DF" stopOpacity=".18"/></linearGradient>
              <linearGradient id="scene-glass" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".7"/><stop offset=".48" stopColor="#fff" stopOpacity=".05"/><stop offset="1" stopColor="#fff" stopOpacity=".28"/></linearGradient>
              <linearGradient id="scene-person-a" x1="225" y1="106" x2="387" y2="324" gradientUnits="userSpaceOnUse"><stop stopColor="#D6F1FF"/><stop offset="1" stopColor="#7DBEFF"/></linearGradient>
              <linearGradient id="scene-person-b" x1="365" y1="120" x2="499" y2="327" gradientUnits="userSpaceOnUse"><stop stopColor="#BDF2E4"/><stop offset="1" stopColor="#78C6DC"/></linearGradient>
              <radialGradient id="scene-glow"><stop stopColor="#8BCBFF" stopOpacity=".42"/><stop offset="1" stopColor="#8BCBFF" stopOpacity="0"/></radialGradient>
              <filter id="scene-blur"><feGaussianBlur stdDeviation="13"/></filter>
            </defs>
            <ellipse cx="349" cy="225" rx="232" ry="165" fill="url(#scene-glow)" filter="url(#scene-blur)" />
            <g className={styles.orbits} stroke="url(#scene-thread)" strokeWidth="1">
              <path d="M50 235C135 91 270 40 418 83c112 32 187 120 246 206" opacity=".65"/>
              <path d="M43 300C163 353 283 366 398 308 510 252 546 152 657 158" opacity=".7"/>
              <path d="M99 130c101 14 154 85 247 111 113 32 174-22 253-116" opacity=".45"/>
              <ellipse cx="354" cy="220" rx="247" ry="140" transform="rotate(-15 354 220)" opacity=".35"/>
            </g>
            <path className={styles.travelingLight} d="M43 300C163 353 283 366 398 308 510 252 546 152 657 158" stroke="#D8FFFF" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 180" opacity=".8"/>
            <g className={styles.twinkle} fill="#D9F5FF">
              <circle cx="91" cy="196" r="3"/><circle cx="161" cy="112" r="2"/><circle cx="575" cy="117" r="3"/><circle cx="619" cy="250" r="2.5"/><circle cx="148" cy="322" r="3"/><circle cx="538" cy="321" r="2"/><circle cx="341" cy="56" r="2"/>
              <path d="M116 249v16m-8-8h16M563 201v14m-7-7h14" stroke="#D9F5FF" strokeWidth="1" opacity=".7"/>
            </g>
            <g className={styles.figures}>
              <path d="M213 177c0-55 43-96 95-96 52 0 95 41 95 96 0 44-28 80-68 92l-26 29 2-25c-55 2-98-41-98-96Z" fill="url(#scene-person-a)" fillOpacity=".95"/>
              <path d="M354 207c0-48 37-84 82-84s82 36 82 84c0 45-36 82-82 82h-2l2 25-24-29c-34-11-58-42-58-78Z" fill="url(#scene-person-b)" fillOpacity=".96"/>
              <path d="M229 158c8-37 40-64 79-64 28 0 52 12 67 32" stroke="url(#scene-glass)" strokeWidth="2" strokeLinecap="round" opacity=".8"/>
              <path d="M366 189c7-31 35-54 70-54 22 0 42 10 55 26" stroke="url(#scene-glass)" strokeWidth="2" strokeLinecap="round" opacity=".7"/>
              <path d="M372 236c8 16 21 27 38 33" stroke="#F5FFFF" strokeOpacity=".3" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="306" cy="165" r="24" fill="#1C54A3" fillOpacity=".85"/>
              <path d="M263 229c4-23 21-37 43-37s39 14 43 37" fill="#1C54A3" fillOpacity=".85"/>
              <circle cx="436" cy="194" r="20" fill="#195B82" fillOpacity=".82"/>
              <path d="M400 247c4-19 18-31 36-31s32 12 36 31" fill="#195B82" fillOpacity=".82"/>
              <path d="M355 173c13-7 27-6 39 1" stroke="#F2FFFF" strokeOpacity=".9" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 8"/>
            </g>
          </svg>
          <span className={`${styles.note} ${styles.noteOne}`}><i /> להקשיב</span>
          <span className={`${styles.note} ${styles.noteTwo}`}><i /> להיות שם</span>
          <span className={`${styles.note} ${styles.noteThree}`}><i /> ללוות</span>
        </div>
      </div>

      <footer className={styles.footer}>
        <p>אנשים טובים. דרך משותפת.<br /><span>והרבה משמעות בכל צעד.</span></p>
        <button type="button" className={styles.motionToggle} onClick={() => { setPaused(!paused); resetPointer(); }}>
          <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span> {paused ? "הפעלת תנועה" : "עצירת תנועה"}
        </button>
      </footer>
    </div>
  );
}
