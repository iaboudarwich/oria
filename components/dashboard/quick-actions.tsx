import Link from "next/link";
import {
  CalendarIcon,
  SearchIcon,
  UploadIcon,
} from "@/components/ui/icon";

/**
 * Quick-action tiles shown on the dashboard home.
 * Three focused CTAs to get users into the most common flows instantly.
 */
export function QuickActions() {
  const actions = [
    {
      href: "/dashboard/inbox",
      icon: <UploadIcon size={18} />,
      label: "Upload",
      description: "Add a document, photo, or receipt",
    },
    {
      href: "/dashboard/ask",
      icon: <SearchIcon size={18} />,
      label: "Ask Oria",
      description: "Search or ask a question",
    },
    {
      href: "/dashboard/calendar",
      icon: <CalendarIcon size={18} />,
      label: "Calendar",
      description: "Reminders and upcoming events",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface-raised p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand transition-base group-hover:bg-brand group-hover:text-white">
            {a.icon}
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-ink">{a.label}</p>
            <p className="mt-0.5 text-[11.5px] text-ink-muted hidden sm:block">
              {a.description}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
