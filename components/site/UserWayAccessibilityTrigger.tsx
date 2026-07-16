import { cn } from "@/lib/cn";
import { USERWAY_ACCOUNT_ID, USERWAY_TRIGGER_ID } from "@/lib/userway";

function AccessibilityIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[1.35rem] w-[1.35rem]"
      fill="none"
    >
      <circle cx="12" cy="5.25" r="1.75" fill="currentColor" />
      <path
        d="M5.25 9.35c2.15-.9 4.4-1.35 6.75-1.35s4.6.45 6.75 1.35M12 8.35v5.1m0 0-3.55 5.3M12 13.45l3.55 5.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.1 12.15a8.25 8.25 0 0 0 15.8 0"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.42"
      />
    </svg>
  );
}

export function UserWayAccessibilityTrigger({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <button
      id={USERWAY_TRIGGER_ID}
      type="button"
      aria-label={label}
      title={label}
      disabled={!USERWAY_ACCOUNT_ID}
      className={cn(
        "group grid h-11 w-11 shrink-0 place-items-center rounded-full border border-brand-700/15 bg-brand-50/65 text-brand-800 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.8)] transition-[color,background-color,border-color,transform] duration-200 ease-out-quart hover:border-brand-700/30 hover:bg-brand-100 hover:text-brand-900 active:scale-[0.96] disabled:cursor-wait disabled:opacity-70",
        className,
      )}
    >
      <span className="transition-transform duration-200 ease-out-quart group-hover:scale-105">
        <AccessibilityIcon />
      </span>
    </button>
  );
}
