"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CalendarIcon,
  ChatIcon,
  ChevronUpIcon,
  DocumentIcon,
  MicIcon,
  PaperclipIcon,
  SearchIcon,
  TagIcon,
} from "@/components/ui/icon";

type ApiUpload = {
  id: string;
  title: string;
  section_label: string;
  document_type: string | null;
  mime_type: string | null;
  thumbnail_url: string | null;
  relative_time: string;
  href: string;
};

type ApiSection = {
  id: string;
  name: string;
  href: string;
  kind: "builtin" | "custom";
};

type ApiReminder = {
  id: string;
  title: string;
  due_at: string | null;
  href: string;
};

type ApiPage = {
  id: string;
  label: string;
  href: string;
};

type ApiResponse = {
  uploads: ApiUpload[];
  sections: ApiSection[];
  reminders: ApiReminder[];
  pages: ApiPage[];
};

type Flat =
  | { kind: "upload"; data: ApiUpload }
  | { kind: "section"; data: ApiSection }
  | { kind: "reminder"; data: ApiReminder }
  | { kind: "page"; data: ApiPage };

type Variant = "dropdown" | "inline";

type Props = {
  variant?: Variant;
  placeholder?: string;
  initialQuery?: string;
  autoFocus?: boolean;
};

const RECENT_KEY = "oria.recent_searches";
const MAX_RECENT = 6;

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rememberRecent(q: string) {
  if (typeof window === "undefined" || !q.trim()) return;
  const list = [q, ...readRecent().filter((x) => x !== q)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-accent-soft/70 rounded-sm text-ink">
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </>
  );
}

function iconFor(upload: ApiUpload): React.ReactNode {
  const m = (upload.mime_type ?? "").toLowerCase();
  if (m.startsWith("image/")) return <PaperclipIcon size={14} />;
  if (m === "application/pdf") return <DocumentIcon size={14} />;
  if (m.startsWith("audio/")) return <MicIcon size={14} />;
  if (m.includes("word") || m.includes("text")) return <ChatIcon size={14} />;
  return <DocumentIcon size={14} />;
}

export function LiveSearch({
  variant = "dropdown",
  placeholder = "Ask Oria anything you've uploaded",
  initialQuery = "",
  autoFocus = false,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ApiResponse | null>(null);
  const [open, setOpen] = useState(variant === "inline");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const recentLoaded = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cmd/Ctrl + K focuses the input from anywhere. (Subscribes to a DOM event,
  // setState happens only inside the event listener. allowed.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Debounced fetch. The effect itself just schedules; setState happens inside
  // the async timeout / fetch callback (React rule-compliant).
  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!r.ok) return;
        const data = (await r.json()) as ApiResponse;
        setResults(data);
      } catch {
        // aborted or network failure
      }
    }, 140);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  // Click-outside closes the dropdown variant. setState is inside the event
  // callback, not synchronous in the effect body.
  useEffect(() => {
    if (variant !== "dropdown") return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [variant]);

  const handleQueryChange = (v: string) => {
    setQuery(v);
    setOpen(true);
    setActiveIndex(-1);
    if (v.trim().length === 0) setResults(null);
  };

  const handleFocus = () => {
    setOpen(true);
    if (!recentLoaded.current) {
      recentLoaded.current = true;
      setRecent(readRecent());
    }
  };

  // Flat list for keyboard nav.
  const flat: Flat[] = useMemo(() => {
    if (!results) return [];
    const items: Flat[] = [];
    results.uploads.forEach((d) => items.push({ kind: "upload", data: d }));
    results.sections.forEach((d) => items.push({ kind: "section", data: d }));
    results.reminders.forEach((d) => items.push({ kind: "reminder", data: d }));
    results.pages.forEach((d) => items.push({ kind: "page", data: d }));
    return items;
  }, [results]);

  // Loading is derived: a non-empty query without results yet.
  const loading = query.trim().length > 0 && results === null;

  const navigateTo = useCallback(
    (href: string) => {
      rememberRecent(query.trim());
      setOpen(false);
      router.push(href);
    },
    [router, query],
  );

  const submitFullSearch = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    rememberRecent(q);
    if (variant === "inline") return;
    router.push(`/dashboard/search?q=${encodeURIComponent(q)}`);
  }, [query, router, variant]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && flat[activeIndex]) {
        e.preventDefault();
        navigateTo(flat[activeIndex].data.href);
      } else {
        submitFullSearch();
      }
    } else if (e.key === "Escape") {
      if (variant === "dropdown") setOpen(false);
      else setQuery("");
      inputRef.current?.blur();
    }
  };

  const showResults =
    open &&
    (variant === "inline" ||
      query.trim().length > 0 ||
      recent.length > 0);
  const hasAny =
    results &&
    (results.uploads.length > 0 ||
      results.sections.length > 0 ||
      results.reminders.length > 0 ||
      results.pages.length > 0);

  const inputCls =
    variant === "inline"
      ? "h-14 px-4 text-[15px]"
      : "h-12 px-3.5 text-[14.5px]";

  return (
    <div
      ref={containerRef}
      className={variant === "dropdown" ? "relative" : ""}
    >
      <div
        className={`flex items-center gap-2.5 rounded-2xl border bg-surface-raised shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.10)] transition-base focus-within:border-ink-muted focus-within:shadow-[0_2px_4px_rgba(28,26,23,0.05),0_8px_24px_-14px_rgba(28,26,23,0.30)] ${inputCls} ${
          open ? "border-line-strong" : "border-line"
        }`}
      >
        <SearchIcon size={15} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={onKey}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="h-full w-full bg-transparent text-ink placeholder:text-ink-faint outline-none"
        />
        <span className="hidden rounded border border-line px-1.5 py-0.5 text-[10.5px] text-ink-faint sm:inline">
          ⌘K
        </span>
      </div>

      {showResults ? (
        <ResultsPanel
          variant={variant}
          query={query}
          loading={loading}
          results={results}
          activeIndex={activeIndex}
          recent={recent}
          hasAny={!!hasAny}
          onActivate={(href) => navigateTo(href)}
          onRecentClick={(q) => {
            handleQueryChange(q);
            inputRef.current?.focus();
          }}
          onClearRecent={() => {
            localStorage.removeItem(RECENT_KEY);
            setRecent([]);
          }}
        />
      ) : null}
    </div>
  );
}

function ResultsPanel({
  variant,
  query,
  loading,
  results,
  activeIndex,
  recent,
  hasAny,
  onActivate,
  onRecentClick,
  onClearRecent,
}: {
  variant: Variant;
  query: string;
  loading: boolean;
  results: ApiResponse | null;
  activeIndex: number;
  recent: string[];
  hasAny: boolean;
  onActivate: (href: string) => void;
  onRecentClick: (q: string) => void;
  onClearRecent: () => void;
}) {
  const wrapper =
    variant === "dropdown"
      ? "absolute left-0 right-0 top-full mt-2 z-30 rounded-2xl border border-line bg-surface-raised shadow-[0_10px_30px_-15px_rgba(28,26,23,0.18)] overflow-hidden animate-fade-up"
      : "mt-6 rounded-2xl border border-line bg-surface-raised overflow-hidden";

  const q = query.trim();

  // Empty input: show recent searches (dropdown only) or a calm hint (inline).
  if (q.length === 0) {
    if (variant === "inline") return null;
    if (recent.length === 0) return null;
    return (
      <div className={wrapper}>
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            Recent
          </p>
          <button
            type="button"
            onClick={onClearRecent}
            className="text-[11px] text-ink-faint hover:text-ink transition-base"
          >
            Clear
          </button>
        </div>
        <ul className="pb-2">
          {recent.map((r) => (
            <li key={r}>
              <button
                type="button"
                onClick={() => onRecentClick(r)}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-ink-soft transition-base hover:bg-canvas/60 hover:text-ink"
              >
                <ChevronUpIcon size={12} />
                <span className="flex-1 truncate">{r}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (loading && !results) {
    return (
      <div className={wrapper}>
        <p className="px-4 py-4 text-[12.5px] text-ink-faint">Searching…</p>
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className={wrapper}>
        <p className="px-4 py-4 text-[12.5px] text-ink-faint">
          No matches for &ldquo;{q}&rdquo; yet.
        </p>
      </div>
    );
  }

  let cursor = 0;

  return (
    <div className={wrapper}>
      {results!.uploads.length > 0 ? (
        <Group label="Uploads">
          {results!.uploads.map((u) => {
            const idx = cursor++;
            return (
              <Row
                key={`u-${u.id}`}
                href={u.href}
                active={activeIndex === idx}
                onActivate={onActivate}
                leading={
                  u.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.thumbnail_url}
                      alt=""
                      className="h-8 w-8 rounded-md border border-line object-cover"
                    />
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
                      {iconFor(u)}
                    </span>
                  )
                }
                title={highlight(u.title, q)}
                subtitle={`${u.section_label} · ${u.relative_time}`}
              />
            );
          })}
        </Group>
      ) : null}

      {results!.sections.length > 0 ? (
        <Group label="Sections">
          {results!.sections.map((s) => {
            const idx = cursor++;
            return (
              <Row
                key={`s-${s.id}`}
                href={s.href}
                active={activeIndex === idx}
                onActivate={onActivate}
                leading={
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
                    <TagIcon size={13} />
                  </span>
                }
                title={highlight(s.name, q)}
                subtitle={s.kind === "builtin" ? "Built in" : "Custom"}
              />
            );
          })}
        </Group>
      ) : null}

      {results!.reminders.length > 0 ? (
        <Group label="Reminders">
          {results!.reminders.map((r) => {
            const idx = cursor++;
            const due = r.due_at
              ? new Date(r.due_at).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "No due date";
            return (
              <Row
                key={`r-${r.id}`}
                href={r.href}
                active={activeIndex === idx}
                onActivate={onActivate}
                leading={
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
                    <CalendarIcon size={13} />
                  </span>
                }
                title={highlight(r.title, q)}
                subtitle={due}
              />
            );
          })}
        </Group>
      ) : null}

      {results!.pages.length > 0 ? (
        <Group label="Pages">
          {results!.pages.map((p) => {
            const idx = cursor++;
            return (
              <Row
                key={`p-${p.id}`}
                href={p.href}
                active={activeIndex === idx}
                onActivate={onActivate}
                leading={null}
                title={highlight(p.label, q)}
                subtitle="Go to page"
                compact
              />
            );
          })}
        </Group>
      ) : null}
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line last:border-b-0">
      <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </p>
      <ul className="pb-2">{children}</ul>
    </section>
  );
}

function Row({
  href,
  active,
  onActivate,
  leading,
  title,
  subtitle,
  compact,
}: {
  href: string;
  active: boolean;
  onActivate: (href: string) => void;
  leading: React.ReactNode;
  title: React.ReactNode;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={(e) => {
          e.preventDefault();
          onActivate(href);
        }}
        className={`flex items-center gap-3 px-4 transition-base ${
          compact ? "py-1.5" : "py-2"
        } ${active ? "bg-canvas" : "hover:bg-canvas/60"}`}
      >
        {leading}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] text-ink">{title}</p>
          {subtitle ? (
            <p className="truncate text-[11.5px] text-ink-faint">{subtitle}</p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
