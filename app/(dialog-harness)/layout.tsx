import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { DirectionProvider } from "@/components/staff/ui/direction";
import { TooltipProvider } from "@/components/staff/ui/tooltip";
import "../globals.css";

const heebo = localFont({
  src: "../(staff)/fonts/Heebo-variable.ttf",
  weight: "100 900",
  display: "swap",
  variable: "--font-staff",
});

export const metadata: Metadata = {
  title: "Dialog harness",
  robots: { index: false, follow: false },
};

export default function DialogHarnessLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="staff-app">
        <DirectionProvider direction="rtl">
          <TooltipProvider delay={350}>{children}</TooltipProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
