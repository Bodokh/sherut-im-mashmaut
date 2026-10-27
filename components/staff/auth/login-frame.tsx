import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, HandHeart, LockKeyhole } from "lucide-react";
import { LoginScene } from "./login-scene";
import styles from "./login-frame.module.css";

export function LoginFrame({ title, description, children, footer }: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <section className={styles.formPanel} dir="rtl" aria-labelledby="login-title">
          <header className={styles.navigation}>
            <Link href="/" className={styles.backLink}>
              <ArrowUpRight aria-hidden="true" />
              לאתר העמותה
            </Link>
            <Link href="/" className={styles.mobileBrand} aria-label="שירות עם משמעות — לאתר העמותה">
              <HandHeart aria-hidden="true" />
              שירות עם משמעות
            </Link>
          </header>

          <div className={styles.formArea}>
            <div className={styles.introduction}>
              <div className={styles.welcomeMark} aria-hidden="true"><HandHeart /></div>
              <h1 id="login-title">{title}</h1>
              <p>{description}</p>
            </div>
            <div className={styles.formBody}>{children}</div>
            {footer && <div className={styles.accountFooter}>{footer}</div>}
          </div>

          <footer className={styles.privacy}>
            <LockKeyhole aria-hidden="true" />
            <span>מרחב אישי ומאובטח לצוות הליווי</span>
          </footer>
        </section>

        <aside className={styles.scenePanel} dir="rtl" aria-label="שירות עם משמעות — לאורך כל הדרך">
          <LoginScene />
        </aside>
      </div>
    </main>
  );
}
