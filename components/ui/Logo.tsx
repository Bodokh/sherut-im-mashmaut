import { cn } from "@/lib/cn";

/**
 * Brand emblem: a green "flame of meaning / sprout of life" cradled by a
 * techelet arc (the land / community holding it up). Carries the blue+green
 * identity symbolically — no flag-kitsch. Works on light and dark surfaces.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-hidden="true"
      className={cn("h-8 w-8", className)}
      fill="none"
    >
      {/* cradle / horizon */}
      <path
        d="M5 20.5a11 11 0 0 0 22 0"
        stroke="var(--color-brand-500)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* flame / sprout */}
      <path
        d="M16 4.2c4.9 5.1 5.2 9.7 2.6 14.2-1 1.8-2.6 2.9-2.6 2.9s-1.6-1.1-2.6-2.9C10.8 13.9 11.1 9.3 16 4.2Z"
        fill="var(--color-green-500)"
      />
      {/* inner light */}
      <path
        d="M16 9.6c1.9 2.4 2 4.7.8 6.9-.4.8-.8 1.2-.8 1.2s-.4-.4-.8-1.2c-1.2-2.2-1.1-4.5.8-6.9Z"
        fill="var(--color-green-200)"
        opacity="0.9"
      />
    </svg>
  );
}

export function Logo({
  name,
  className,
  markClassName,
}: {
  name: string;
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="font-display text-[1.32rem] leading-none font-bold tracking-tight">
        {name}
      </span>
    </span>
  );
}
