import type { Metadata } from "next";
import Script from "next/script";
import { NotFoundScreen } from "@/components/site/NotFoundScreen";
import { defaultLocale, dir } from "@/i18n/config";
import { isStaffPathname, localeFromPathname } from "@/lib/pathname-locale";
import { requestPathname } from "@/lib/request-pathname";
import { buildNotFoundMetadata } from "@/lib/seo";
import {
  USERWAY_ACCOUNT_ID,
  USERWAY_TRIGGER_ID,
  USERWAY_WIDGET_SRC,
} from "@/lib/userway";
import "./globals.css";

async function requestContext() {
  const pathname = await requestPathname();
  const staff = isStaffPathname(pathname);
  const locale = staff ? defaultLocale : localeFromPathname(pathname);
  return { staff, locale };
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestContext();
  return buildNotFoundMetadata(locale);
}

export default async function GlobalNotFound() {
  const { staff, locale } = await requestContext();

  return (
    <html lang={locale} dir={dir(locale)} suppressHydrationWarning>
      <body className="min-h-dvh">
        <NotFoundScreen locale={locale} context={staff ? "staff" : "site"} />
        {USERWAY_ACCOUNT_ID ? (
          <Script
            id="userway-widget"
            src={USERWAY_WIDGET_SRC}
            strategy="lazyOnload"
            data-account={USERWAY_ACCOUNT_ID}
            data-trigger={USERWAY_TRIGGER_ID}
            data-mobile="true"
          />
        ) : null}
      </body>
    </html>
  );
}
