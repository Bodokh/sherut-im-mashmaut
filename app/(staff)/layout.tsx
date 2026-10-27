import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { StaffAuthProvider } from "@/components/staff/auth/auth-provider";
import { StaffProviders } from "@/components/staff/providers";
import "../globals.css";

const heebo = localFont({
  src: "./fonts/Heebo-variable.ttf",
  weight: "100 900",
  display: "swap",
  variable: "--font-staff",
});

export const metadata: Metadata = {
  title: { default: "סביבת הליווי | שירות עם משמעות", template: "%s | סביבת הליווי" },
  description: "סביבת העבודה של צוות הליווי בשירות עם משמעות.",
  robots: { index: false, follow: false },
};

export default function StaffRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="staff-app">
        <StaffAuthProvider>
          <StaffProviders>{children}</StaffProviders>
        </StaffAuthProvider>
      </body>
    </html>
  );
}
