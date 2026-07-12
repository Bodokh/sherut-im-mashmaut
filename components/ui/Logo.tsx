import { cn } from "@/lib/cn";

/**
 * Brand mark: a clean geometric ש (the shin of "שירות") on a techelet badge —
 * deliberately without scribal tagim. The middle stem carries the brand green:
 * the one who is held by the community around her.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      className={cn("h-9 w-9 drop-shadow-sm", className)}
      fill="none"
    >
      <circle cx="32" cy="32" r="32" fill="var(--color-brand-700)" />
      <path
        d="M32 18.5 V40"
        stroke="var(--color-green-300)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M16.5 17.5 L20 32.5 Q20 44 31 44 L33 44 Q44 44 44 32.5 L47.5 17.5"
        stroke="white"
        strokeWidth="6"
        strokeLinecap="round"
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
