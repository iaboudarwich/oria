"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/ui/icon";
import { uploadFile } from "@/lib/data/upload-actions";

export type TaskPhase = "pending" | "uploading" | "reading" | "done" | "error";

export type UploadTask = {
  id: string;
  name: string;
  phase: TaskPhase;
  message?: string;
};

// Cap concurrent uploads so a big batch doesn't hammer the extraction pipeline
// / Anthropic rate limits. Extra files queue and start as slots free up.
const MAX_CONCURRENCY = 3;

function newId(name: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.round(performance.now())}-${name}`;
}

/**
 * A small parallel upload queue. Each file is uploaded (bytes + row creation)
 * up to MAX_CONCURRENCY at a time; the rest wait. After a file's bytes land we
 * poll its server-side processing to a terminal state so the per-file row can
 * show "Done". Non-blocking: callers can enqueue more files at any time.
 */
export function useUploadQueue(opts: {
  /** Build the multipart body for one file (section/smart-section tagging,
   *  plus an optional group_id for a multi-image set). */
  buildFormData: (file: File, groupId?: string) => FormData;
  /** Fired after each file reaches a terminal state (e.g. router.refresh). */
  onComplete?: () => void;
  /** Fired once after every file of a given group has settled, so the caller
   *  can kick off the one-shot group extraction. */
  onGroupSettled?: (groupId: string) => void;
}) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const groupMapRef = useRef<Map<string, string | undefined>>(new Map());
  // Per-group bookkeeping so a multi-image set is read as one: which task ids
  // belong to a group, and how many of its uploads are still in flight.
  const groupTaskIdsRef = useRef<Map<string, string[]>>(new Map());
  const groupRemainingRef = useRef<Map<string, number>>(new Map());
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(0);

  // Keep callbacks in refs so the async pool always reads the latest without
  // re-creating the pool functions (which would churn the concurrency state).
  // Synced in an effect (never written during render).
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const setPhase = useCallback(
    (id: string, phase: TaskPhase, message?: string) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, phase, message } : t)),
      );
    },
    [],
  );

  const pollUntilDone = useCallback(
    (uploadId: string) =>
      new Promise<void>((resolve) => {
        let elapsed = 0;
        const interval = window.setInterval(async () => {
          elapsed += 1500;
          try {
            const r = await fetch(`/api/uploads/${uploadId}/status`, {
              cache: "no-store",
            });
            if (r.ok) {
              const data = (await r.json()) as { status: string };
              if (data.status === "filed" || data.status === "failed") {
                window.clearInterval(interval);
                resolve();
                return;
              }
            }
          } catch {
            // ignore network blips
          }
          if (elapsed > 60_000) {
            window.clearInterval(interval);
            resolve();
          }
        }, 1500);
      }),
    [],
  );

  const pumpRef = useRef<() => void>(() => {});

  // Once every upload of a group has landed: run the one-shot group extraction
  // (the caller's onGroupSettled), then flip the group's reading tasks to done.
  // Grouped uploads do NOT poll per file, because their status only becomes
  // "filed" as a side effect of this group read.
  const settleGroup = useCallback(async (groupId: string) => {
    try {
      await optsRef.current.onGroupSettled?.(groupId);
    } catch {
      // The cron fallback will still read the group; never block the UI.
    }
    const ids = new Set(groupTaskIdsRef.current.get(groupId) ?? []);
    setTasks((prev) =>
      prev.map((t) => (ids.has(t.id) && t.phase === "reading" ? { ...t, phase: "done" } : t)),
    );
    optsRef.current.onComplete?.();
    groupTaskIdsRef.current.delete(groupId);
    groupRemainingRef.current.delete(groupId);
  }, []);

  const runTask = useCallback(
    async (id: string) => {
      const file = fileMapRef.current.get(id);
      if (!file) {
        runningRef.current -= 1;
        return;
      }
      const groupId = groupMapRef.current.get(id);
      setPhase(id, "uploading");
      try {
        const result = await uploadFile(optsRef.current.buildFormData(file, groupId));
        if (!result.ok) {
          setPhase(id, "error", result.error);
        } else if (groupId) {
          // Grouped: uploaded; wait for the whole set to be read together.
          setPhase(id, "reading");
        } else {
          setPhase(id, "reading");
          await pollUntilDone(result.id);
          setPhase(id, "done");
          optsRef.current.onComplete?.();
        }
      } catch {
        setPhase(id, "error", "Upload failed");
      } finally {
        fileMapRef.current.delete(id);
        groupMapRef.current.delete(id);
        runningRef.current -= 1;
        if (groupId) {
          const remaining = (groupRemainingRef.current.get(groupId) ?? 1) - 1;
          groupRemainingRef.current.set(groupId, remaining);
          if (remaining <= 0) void settleGroup(groupId);
        }
        pumpRef.current();
      }
    },
    [setPhase, pollUntilDone, settleGroup],
  );

  const pump = useCallback(() => {
    while (runningRef.current < MAX_CONCURRENCY && queueRef.current.length > 0) {
      const id = queueRef.current.shift();
      if (!id) break;
      runningRef.current += 1;
      void runTask(id);
    }
  }, [runTask]);
  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const enqueue = useCallback(
    (files: File[], groupId?: string) => {
      const ids: string[] = [];
      const added: UploadTask[] = files.map((f) => {
        const id = newId(f.name);
        fileMapRef.current.set(id, f);
        groupMapRef.current.set(id, groupId);
        queueRef.current.push(id);
        ids.push(id);
        return { id, name: f.name, phase: "pending" as const };
      });
      if (groupId) {
        groupTaskIdsRef.current.set(groupId, ids);
        groupRemainingRef.current.set(groupId, ids.length);
      }
      setTasks((prev) => [...prev, ...added]);
      pump();
    },
    [pump],
  );

  const activeCount = tasks.filter(
    (t) =>
      t.phase === "pending" || t.phase === "uploading" || t.phase === "reading",
  ).length;

  // Expose in-flight upload count globally so the deploy VersionWatcher can
  // suppress auto-refresh while a batch is uploading.
  useEffect(() => {
    (window as unknown as { __oriaUploadsActive?: number }).__oriaUploadsActive =
      activeCount;
    return () => {
      (window as unknown as { __oriaUploadsActive?: number }).__oriaUploadsActive = 0;
    };
  }, [activeCount]);

  const clear = useCallback(() => {
    setTasks((prev) =>
      prev.filter(
        (t) =>
          t.phase === "pending" ||
          t.phase === "uploading" ||
          t.phase === "reading",
      ),
    );
  }, []);

  return { tasks, enqueue, activeCount, clear };
}

const PHASE_LABEL: Record<TaskPhase, string> = {
  pending: "Waiting",
  uploading: "Uploading",
  reading: "Oria is reading",
  done: "Done",
  error: "Failed",
};

/** Per-file status list for a multi-file batch. */
export function UploadQueue({
  tasks,
  activeCount,
  onClear,
}: {
  tasks: UploadTask[];
  activeCount: number;
  onClear: () => void;
}) {
  if (tasks.length === 0) return null;
  const doneCount = tasks.filter((t) => t.phase === "done").length;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line bg-surface-raised">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="text-[12px] text-ink-muted">
          {activeCount > 0
            ? `Uploading ${activeCount} of ${tasks.length}`
            : `${doneCount} of ${tasks.length} done`}
        </p>
        {activeCount === 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[11.5px] text-ink-faint transition-base hover:text-ink"
          >
            Clear
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-line">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2.5 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
              {t.name}
            </span>
            {t.phase === "done" ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-muted">
                <CheckIcon size={12} />
                {PHASE_LABEL.done}
              </span>
            ) : t.phase === "error" ? (
              <span className="text-[11.5px] text-claret">
                {t.message ?? PHASE_LABEL.error}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
                {PHASE_LABEL[t.phase]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
