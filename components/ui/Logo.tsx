import Image from "next/image";
import { cn } from "@/lib/cn";

const LOGO_MARK_SRC = "/images/sherut-logo-mark.png";

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={LOGO_MARK_SRC}
      alt=""
      aria-hidden="true"
      width={192}
      height={192}
      decoding="async"
      loading="eager"
      sizes="36px"
      className={cn("h-9 w-9 rounded-full object-cover shadow-soft", className)}
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
