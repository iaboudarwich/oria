"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";

const ROLES: { id: string; label: string }[] = [
  { id: "principal", label: "Principal" },
  { id: "assistant", label: "Assistant" },
  { id: "accountant", label: "Accountant" },
  { id: "staff", label: "Staff" },
  { id: "household", label: "Household" },
  { id: "external", label: "External" },
];

export function DemoHeader() {
  return (
    <header className="border-b border-line bg-canvas">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span className="rounded-md border border-line bg-surface-raised px-2 py-0.5 text-[11px] text-ink-muted">
            Demo
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="transition-base hidden text-[13px] text-ink-muted hover:text-ink sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="transition-base inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12.5px] text-surface hover:bg-ink-soft"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

export function DemoBanner() {
  return (
    <div className="border-b border-line bg-surface/60">
      <div className="mx-auto max-w-[1100px] px-6 py-3 text-center text-[12.5px] text-ink-muted sm:px-8">
        You&apos;re browsing example data. Sign up to use Oria with your own life.
      </div>
    </div>
  );
}

export function DemoTabs() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-line">
      <div className="mx-auto max-w-[1100px] px-6 sm:px-8">
        <div className="-mx-2 flex items-center gap-1 overflow-x-auto py-2">
          {ROLES.map((r) => {
            const active = pathname === `/demo/${r.id}`;
            return (
              <Link
                key={r.id}
                href={`/demo/${r.id}`}
                className={`transition-base rounded-lg px-3 py-1.5 text-[12.5px] whitespace-nowrap ${
                  active
                    ? "bg-ink text-surface"
                    : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                }`}
              >
                {r.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function DemoTopbar({ title }: { title: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-[20px] font-semibold tracking-tight text-ink sm:text-[22px]">{title}</h1>
    </div>
  );
}
