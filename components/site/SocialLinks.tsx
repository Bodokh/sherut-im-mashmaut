import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { cn } from "@/lib/cn";
import { socialLinks } from "@/lib/contact";
import type { Dictionary } from "@/i18n/dictionaries";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M14.5 8.5V6.8c0-.7.5-1.3 1.2-1.3H17V3h-2.1C12.6 3 11 4.6 11 6.6v1.9H9v2.6h2V21h3.5v-9.9h2.3l.5-2.6h-2.8Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3a2.7 2.7 0 0 0-1.9 1.9C2 8.9 2 12 2 12s0 3.1.4 4.8a2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9C22 15.1 22 12 22 12s0-3.1-.4-4.8ZM10 15.5v-7l6 3.5-6 3.5Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.7 3H19.4l-6.2 7.1L20.5 21h-5.3l-4.2-5.5L6.3 21H3.6l6.6-7.6L3.5 3h5.4l3.8 5L16.7 3Zm-1 16.2h1.5L8.4 4.7H6.8l8.9 14.5Z" />
    </svg>
  );
}

const items = [
  { key: "facebook", href: socialLinks.facebook, Icon: FacebookIcon },
  { key: "instagram", href: socialLinks.instagram, Icon: InstagramIcon },
  { key: "youtube", href: socialLinks.youtube, Icon: YouTubeIcon },
  { key: "x", href: socialLinks.x, Icon: XIcon },
  { key: "whatsapp", href: socialLinks.whatsapp, Icon: WhatsAppIcon },
] as const;

export function SocialLinks({
  labels,
  tone = "light",
  className,
}: {
  labels: Dictionary["footer"]["social"];
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-2", className)}>
      {items.map(({ key, href, Icon }) => (
        <li key={key}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={labels[key]}
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors",
              tone === "dark"
                ? "bg-white/8 text-brand-100 hover:bg-white/15 hover:text-white"
                : "border border-brand-700/15 bg-white text-brand-800 hover:border-brand-700/35 hover:bg-brand-50",
            )}
          >
            <Icon className="h-5 w-5" />
          </a>
        </li>
      ))}
    </ul>
  );
}
