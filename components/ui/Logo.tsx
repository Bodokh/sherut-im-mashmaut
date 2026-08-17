import Image from "next/image";
import { cn } from "@/lib/cn";

const LOGO_MARK_SRC = "/images/logo-mark.png";

/**
 * Brand mark: the organization's emblem — a Star of David with a flowing path
 * and a growing sprout — on its navy badge. Extracted from the client's logo
 * artwork with the lettering removed (per the fix list: no tagim, no text).
 */
export function LogoMark({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={LOGO_MARK_SRC}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      decoding="async"
      priority={priority}
      sizes="40px"
      className={cn("h-10 w-10 shrink-0 rounded-full shadow-soft", className)}
    />
  );
}

export function Logo({
  name,
  className,
  markClassName,
  priority,
}: {
  name: string;
  className?: string;
  markClassName?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <LogoMark className={markClassName} priority={priority} />
      <span className="hidden font-display text-[1.2rem] leading-none font-bold tracking-tight min-[420px]:inline sm:text-[1.32rem]">
        {name}
      </span>
    </span>
  );
}
