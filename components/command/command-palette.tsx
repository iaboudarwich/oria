"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { switchSpace } from "@/lib/data/space-actions";

export const COMMAND_OPEN_EVENT = "oria:command-open";

export type PaletteSpace = { id: string; name: string; kind: string };

type SearchResults = {
  uploads: Array<{ id: string; title: string; href: string }>;
  sections: Array<{ id: string; name: string; href: string }>;
  reminders: Array<{ id: string; title: string; href: string }>;
  entities: Array<{ id: string; name: string; href: string }>;
};

// Static feature/action registry. Labels + descriptions are localized via the
// "command" namespace so the palette doubles as a discovery surface.
const ACTIONS: { id: string; href: string; keywords: string }[] = [
  { id: "ask", href: "/dashboard/ask", keywords: "ask oria question answer" },
  { id: "upload", href: "/dashboard/inbox", keywords: "upload add file drop inbox" },
  { id: "connect_email", href: "/dashboard/settings?tab=connections", keywords: "connect email gmail inbox sync" },
  { id: "create_reminder", href: "/dashboard/reminders", keywords: "reminder due date follow up todo" },
  { id: "manage_sections", href: "/dashboard/settings?tab=sections", keywords: "sections organize manage categories" },
  { id: "email_routing", href: "/dashboard/settings?tab=connections", keywords: "email routing filters confidentiality workspace" },
  { id: "features", href: "/dashboard/features", keywords: "features what can oria do help index" },
  { id: "settings", href: "/dashboard/settings", keywords: "settings account preferences" },
  { id: "security", href: "/dashboard/settings?tab=security", keywords: "security two factor 2fa password sessions audit" },
  { id: "export_data", href: "/dashboard/settings?tab=privacy", keywords: "export download data privacy" },
  { id: "trash", href: "/dashboard/trash", keywords: "trash deleted bin restore" },
  { id: "timeline", href: "/dashboard/timeline", keywords: "timeline activity feed history" },
];

/** Subsequence fuzzy match: true if every char of q appears in order in text. */
function fuzzy(text: string, q: string): boolean {
  if (!q) return true;
  const t = text.toLowerCase();
  let i = 0;
  for (const ch of q.toLowerCase()) {
    i = t.indexOf(ch, i);
    if (i === -1) return false;
    i += 1;
  }
  return true;
}

type Row = { key: string; label: string; sublabel?: string; onSelect: () => void };

/**
 * Universal command palette. Opens on Cmd/Ctrl+K or the COMMAND_OPEN_EVENT
 * (the topbar search button). Type to fuzzy-search actions, spaces, sections,
 * things, uploads, and reminders; arrow keys + Enter to open, Esc to close.
 */
export function CommandPalette({ spaces }: { spaces: PaletteSpace[] }) {
  const t = useTranslations("command");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({
    uploads: [],
    sections: [],
    reminders: [],
    entities: [],
  });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const openReset = useCallback(() => {
    setQuery("");
    setActive(0);
    setResults({ uploads: [], sections: [], reminders: [], entities: [] });
    setOpen(true);
  }, []);

  // Open via keyboard shortcut + custom event. Resets happen in the handlers,
  // not in an effect, so we never setState synchronously inside an effect.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (v) return false;
          setQuery("");
          setActive(0);
          setResults({ uploads: [], sections: [], reminders: [], entities: [] });
          return true;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMAND_OPEN_EVENT, openReset);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMAND_OPEN_EVENT, openReset);
    };
  }, [openReset]);

  // Focus the input when the palette opens (DOM call, not state).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced dynamic search. Always routed through the timeout so we never
  // setState synchronously in the effect body.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    let live = true;
    const id = window.setTimeout(async () => {
      if (q.length < 1) {
        if (live) setResults({ uploads: [], sections: [], reminders: [], entities: [] });
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok || !live) return;
        const data = (await res.json()) as SearchResults;
        if (live) {
          setResults({
            uploads: data.uploads ?? [],
            sections: data.sections ?? [],
            reminders: data.reminders ?? [],
            entities: data.entities ?? [],
          });
        }
      } catch {
        // transient; leave previous results
      }
    }, 180);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [query, open]);

  const close = useCallback(() => setOpen(false), []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const pickSpace = useCallback(
    (s: PaletteSpace) => {
      close();
      void switchSpace(s.id).then(() => {
        router.push(s.kind === "office" ? "/dashboard/work" : "/dashboard");
        router.refresh();
      });
    },
    [close, router],
  );

  // Build grouped, query-filtered sections of selectable rows.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { heading: string; rows: Row[] }[] = [];

    const actionRows: Row[] = ACTIONS.filter((a) => {
      const label = t(`${a.id}.label`);
      const desc = t(`${a.id}.desc`);
      return !q || fuzzy(`${label} ${desc} ${a.keywords}`, q);
    }).map((a) => ({
      key: `action:${a.id}`,
      label: t(`${a.id}.label`),
      sublabel: t(`${a.id}.desc`),
      onSelect: () => go(a.href),
    }));
    if (actionRows.length) out.push({ heading: t("group_actions"), rows: actionRows });

    const spaceRows: Row[] = spaces
      .filter((s) => !q || fuzzy(s.name, q))
      .map((s) => ({
        key: `space:${s.id}`,
        label: s.name,
        sublabel: t("group_spaces"),
        onSelect: () => pickSpace(s),
      }));
    if (spaceRows.length) out.push({ heading: t("group_spaces"), rows: spaceRows });

    if (results.sections.length) {
      out.push({
        heading: t("group_sections"),
        rows: results.sections.map((s) => ({
          key: `section:${s.id}`,
          label: s.name,
          onSelect: () => go(s.href),
        })),
      });
    }
    if (results.entities.length) {
      out.push({
        heading: t("group_things"),
        rows: results.entities.map((e) => ({
          key: `entity:${e.id}`,
          label: e.name,
          onSelect: () => go(e.href),
        })),
      });
    }
    if (results.uploads.length) {
      out.push({
        heading: t("group_uploads"),
        rows: results.uploads.map((u) => ({
          key: `upload:${u.id}`,
          label: u.title,
          onSelect: () => go(u.href),
        })),
      });
    }
    if (results.reminders.length) {
      out.push({
        heading: t("group_reminders"),
        rows: results.reminders.map((r) => ({
          key: `reminder:${r.id}`,
          label: r.title,
          onSelect: () => go(r.href),
        })),
      });
    }
    return out;
  }, [query, results, spaces, t, go, pickSpace]);

  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  // Clamp at render so the list shrinking never points past the end.
  const activeIdx = flat.length === 0 ? 0 : Math.min(active, flat.length - 1);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIdx + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[activeIdx]?.onSelect();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  if (!open) return null;

  let runningIndex = -1;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[12vh]"
    >
      <div aria-hidden onClick={close} className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-fade-in" />
      <div className="relative z-[201] w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-xl animate-scale-in">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          placeholder={t("placeholder")}
          className="w-full border-b border-line bg-transparent px-4 py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-faint"
          aria-label={t("placeholder")}
        />
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {flat.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-faint">{t("empty")}</p>
          ) : (
            groups.map((g) => (
              <div key={g.heading} className="mb-1">
                <p className="px-4 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
                  {g.heading}
                </p>
                {g.rows.map((row) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  const isActive = idx === activeIdx;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => row.onSelect()}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-base ${
                        isActive ? "bg-canvas" : ""
                      }`}
                    >
                      <span className="min-w-0 truncate text-[13.5px] text-ink">{row.label}</span>
                      {row.sublabel ? (
                        <span className="shrink-0 truncate text-[11.5px] text-ink-faint">
                          {row.sublabel}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
