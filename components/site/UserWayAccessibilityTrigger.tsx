import { cn } from "@/lib/cn";
import { USERWAY_ACCOUNT_ID, USERWAY_TRIGGER_ID } from "@/lib/userway";

function AccessibilityIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.65"
        opacity="0.72"
      />
      <circle cx="12" cy="7.1" r="1.45" fill="currentColor" />
      <path
        d="M7.6 10.45c2.9 1.15 5.9 1.15 8.8 0M12 10.85v3.15m0 0-3.1 4.2M12 14l3.1 4.2"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
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
        "group grid h-11 w-11 shrink-0 place-items-center rounded-full border border-brand-700 bg-brand-700 text-white shadow-soft transition-[background-color,box-shadow,transform] duration-200 ease-out-quart hover:bg-brand-800 hover:shadow-lift active:scale-[0.96] disabled:cursor-wait disabled:opacity-70",
        className,
      )}
    >
      <span className="transition-transform duration-200 ease-out-quart group-hover:scale-[1.04]">
        <AccessibilityIcon />
      </span>
    </button>
  );
}
