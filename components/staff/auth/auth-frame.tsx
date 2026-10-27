import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpLeft, HandHeart, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/staff/ui/card";

export function AuthFrame({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto grid min-h-svh max-w-7xl grid-rows-[auto_1fr] lg:grid-cols-2 lg:grid-rows-none">
        <section className="relative flex flex-col justify-between gap-10 overflow-hidden bg-primary px-6 py-6 text-primary-foreground sm:px-12 lg:m-5 lg:rounded-3xl lg:p-12">
          <div aria-hidden className="pointer-events-none absolute -start-24 -bottom-48 size-[38rem] rounded-full border border-primary-foreground/10" />
          <div aria-hidden className="pointer-events-none absolute -start-8 -bottom-32 size-[30rem] rounded-full border border-primary-foreground/10" />
          <Link href="/" className="relative flex w-fit items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-foreground/15">
              <HandHeart aria-hidden className="size-6" />
            </span>
            <span className="flex flex-col">
              <span className="text-lg font-semibold">שירות עם משמעות</span>
              <span className="text-xs text-primary-foreground/75">מרחב הליווי של הצוות</span>
            </span>
          </Link>
          <div className="relative hidden max-w-md flex-col gap-6 py-16 lg:flex">
            <span className="text-sm text-primary-foreground/75">קרבה. הקשבה. חיזוק.</span>
            <h2 className="text-5xl leading-tight font-semibold tracking-tight">לכל חניכה יש<br /> ליווי לאורך הדרך.</h2>
            <p className="max-w-sm text-base leading-relaxed text-primary-foreground/80">מקום אחד לתכנון המפגש הבא, לתיעוד הקשר ולשמירה על רצף הליווי.</p>
          </div>
          <div className="relative hidden items-center gap-2 text-sm text-primary-foreground/75 lg:flex">
            <ShieldCheck aria-hidden className="size-4" />
            <span>הכניסה מיועדת לצוות מורשה בלבד</span>
          </div>
        </section>
        <section className="flex flex-col items-center justify-center gap-8 px-5 py-10 sm:px-12 lg:py-16">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl"><h1>{title}</h1></CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
            {footer && <CardFooter className="justify-center">{footer}</CardFooter>}
          </Card>
          <Link href="/" className="flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4">
            חזרה לאתר העמותה
            <ArrowUpLeft aria-hidden className="size-4" />
          </Link>
        </section>
      </div>
    </main>
  );
}
