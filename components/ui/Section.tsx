import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "paper" | "surface" | "navy" | "brand" | "give";

const tones: Record<Tone, string> = {
  paper: "",
  surface: "bg-surface",
  navy: "bg-brand-950 text-brand-50",
  brand: "bg-brand-700 text-white",
  give: "bg-green-800 text-white",
};

export function Section({
  id,
  tone = "paper",
  className,
  innerClassName,
  children,
  shell = true,
}: {
  id?: string;
  tone?: Tone;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
  shell?: boolean;
}) {
  const dark = tone === "navy" || tone === "brand" || tone === "give";
  return (
    <section
      id={id}
      data-theme={dark ? "dark" : undefined}
      className={cn(
        "relative scroll-mt-24 py-[clamp(4.5rem,9vw,8.5rem)]",
        tones[tone],
        className,
      )}
    >
      {shell ? <div className={cn("shell", innerClassName)}>{children}</div> : children}
    </section>
  );
}

/** A restrained, branded section label — used sparingly, not on every fold. */
export function Eyebrow({
  children,
  className,
  tone = "light",
}: {
  children: ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm font-semibold",
        tone === "dark" ? "text-brand-200" : "text-brand-700",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "dark" ? "bg-green-400" : "bg-green-500",
        )}
      />
      {children}
    </span>
  );
}
