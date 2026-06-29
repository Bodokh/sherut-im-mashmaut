import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "give" | "outline" | "white" | "outlineLight" | "ghost";
type Size = "md" | "lg";

const base =
  "group/btn relative inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold tracking-tight " +
  "transition-[transform,background-color,box-shadow,border-color] duration-200 ease-out-quart " +
  "active:scale-[0.98] focus-visible:outline-offset-3 disabled:pointer-events-none disabled:opacity-55";

const sizes: Record<Size, string> = {
  md: "min-h-11 px-5 py-2.5 text-[0.95rem]",
  lg: "min-h-13 px-7 py-3.5 text-base",
};

const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-white shadow-soft hover:bg-brand-800 hover:shadow-lift",
  give: "bg-green-700 text-white shadow-soft hover:bg-green-800 hover:shadow-lift",
  outline:
    "border border-brand-700/25 bg-white/40 text-brand-800 hover:border-brand-700/40 hover:bg-brand-50",
  white: "bg-white text-brand-800 shadow-lift hover:bg-brand-50",
  outlineLight:
    "border border-white/30 text-white hover:border-white/60 hover:bg-white/10",
  ghost: "text-brand-800 hover:bg-brand-50",
};

function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 transition-transform duration-200 ease-out-quart group-hover/btn:translate-x-0.5 rtl:-scale-x-100"
      fill="none"
    >
      <path
        d="M5 12h14m0 0-5-5m5 5-5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type CommonProps = {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  className?: string;
  children: ReactNode;
};

type AsButton = CommonProps & ComponentProps<"button"> & { href?: undefined };
type AsLink = CommonProps & {
  href: string;
  external?: boolean;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

export function Button(props: AsButton | AsLink) {
  const { variant = "primary", size = "md", arrow, className, children } = props;
  const classes = cn(base, sizes[size], variants[variant], className);

  if ("href" in props && props.href !== undefined) {
    const { href, external, onClick } = props;
    const content = (
      <>
        <span>{children}</span>
        {arrow ? <Arrow /> : null}
      </>
    );
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes} onClick={onClick}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} onClick={onClick}>
        {content}
      </Link>
    );
  }

  const { variant: _v, size: _s, arrow: _a, className: _c, children: _ch, ...rest } =
    props as AsButton;
  return (
    <button className={classes} {...rest}>
      <span>{children}</span>
      {arrow ? <Arrow /> : null}
    </button>
  );
}
