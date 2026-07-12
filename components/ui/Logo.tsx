import Image from "next/image";
import { cn } from "@/lib/cn";

const LOGO_MARK_SRC = "/images/logo-mark.png";

/**
 * Brand mark: the organization's emblem — a Star of David with a flowing path
 * and a growing sprout — on its navy badge. Extracted from the client's logo
 * artwork with the lettering removed (per the fix list: no tagim, no text).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={LOGO_MARK_SRC}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      decoding="async"
      loading="eager"
      sizes="40px"
      className={cn("h-10 w-10 rounded-full shadow-soft", className)}
    />
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
