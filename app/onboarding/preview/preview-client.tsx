"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/brand/wordmark";
import { ReasoningIndicator } from "@/components/ai/reasoning-indicator";
import { BuildAnimation } from "@/components/onboarding/build-animation";
import { generateOnboardingPlan, executeOnboardingPlan } from "../actions";
import { EMPTY_USER_CONTEXT, type SetupPlan, type UserContext } from "@/lib/onboarding/types";
import { CONTEXT_STORAGE_KEY } from "../conversation/conversation-client";

/**
 * Preview + edit the tailored plan before building. Reads the UserContext the
 * conversation stored, generates the SetupPlan, lets the user rename or remove
 * any space/workspace/section, then builds it all in one transactional pass.
 */
export function PreviewClient() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [plan, setPlan] = useState<SetupPlan | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState(false);
  const started = useRef(false);
  // Build choreography + real execution run in parallel; we leave only when
  // both have finished. animDone flips at the end of the animation; execOk
  // holds the execution result (null while pending).
  const animDone = useRef(false);
  const execOk = useRef<boolean | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let ctx: UserContext = EMPTY_USER_CONTEXT;
    try {
      const raw = sessionStorage.getItem(CONTEXT_STORAGE_KEY);
      if (raw) ctx = JSON.parse(raw) as UserContext;
    } catch {
      // fall through with empty context (generator has a fallback)
    }
    void generateOnboardingPlan(ctx).then((p) => setPlan(p));
  }, []);

  function renameSection(si: number, wi: number, sj: number, value: string) {
    setPlan((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.spaces[si].workspaces[wi].sections[sj].title = value;
      return next;
    });
  }
  function removeSection(si: number, wi: number, sj: number) {
    setPlan((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.spaces[si].workspaces[wi].sections.splice(sj, 1);
      return next;
    });
  }
  function renameWorkspace(si: number, wi: number, value: string) {
    setPlan((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.spaces[si].workspaces[wi].name = value;
      return next;
    });
  }
  function removeWorkspace(si: number, wi: number) {
    setPlan((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.spaces[si].workspaces.splice(wi, 1);
      if (next.spaces[si].workspaces.length === 0) next.spaces.splice(si, 1);
      return next;
    });
  }

  // Navigate (or surface an error) only when the animation and the real
  // execution have both settled, so the crafted moment is never cut short and
  // a slow build never lands the user on the dashboard early.
  function maybeFinish() {
    if (!animDone.current || execOk.current === null) return;
    if (execOk.current) {
      try {
        sessionStorage.removeItem(CONTEXT_STORAGE_KEY);
      } catch {
        // ignore
      }
      router.push("/onboarding/link");
    } else {
      setError(true);
      setBuilding(false);
    }
  }

  function build() {
    if (!plan) return;
    animDone.current = false;
    execOk.current = null;
    setBuilding(true);
    setError(false);
    void executeOnboardingPlan(plan).then((r) => {
      execOk.current = r.ok;
      maybeFinish();
    });
  }

  if (building && plan) {
    const sectionNames = plan.spaces.flatMap((s) =>
      s.workspaces.flatMap((w) => w.sections.map((sec) => sec.title)),
    );
    const accent = plan.spaces[0]?.workspaces[0]?.accent_color ?? null;
    return (
      <Shell>
        <BuildAnimation
          items={sectionNames}
          accent={accent}
          durationMs={7000}
          onComplete={() => {
            animDone.current = true;
            maybeFinish();
          }}
        />
      </Shell>
    );
  }

  if (!plan) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <ReasoningIndicator label={t("preview_designing")} />
          <p className="text-[12.5px] text-ink-faint">{t("preview_designing_time")}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <div className="w-full max-w-xl">
        <h1 className="text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">
          {t("preview_title")}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">{t("preview_subtitle")}</p>

        {error ? (
          <p className="mt-4 rounded-lg border border-claret/30 bg-claret/5 px-3 py-2 text-[12.5px] text-claret">
            {t("preview_error")}
          </p>
        ) : null}

        <div className="mt-6 space-y-5">
          {plan.spaces.map((space, si) => (
            <div key={si}>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                {t(space.area === "work" ? "preview_work" : "preview_personal")} · {space.label}
              </p>
              <div className="mt-2 space-y-3">
                {space.workspaces.map((ws, wi) => (
                  <div key={wi} className="rounded-2xl border border-line bg-surface-raised p-4">
                    <div className="flex items-center gap-2">
                      <input
                        value={ws.name}
                        onChange={(e) => renameWorkspace(si, wi, e.target.value)}
                        className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-[15px] font-semibold text-ink outline-none focus:bg-canvas"
                        aria-label="Workspace name"
                      />
                      <button
                        type="button"
                        onClick={() => removeWorkspace(si, wi)}
                        className="shrink-0 text-[12px] text-ink-faint transition-base hover:text-claret"
                      >
                        {t("preview_remove")}
                      </button>
                    </div>
                    {ws.description ? (
                      <p className="mt-0.5 px-1 text-[12px] text-ink-muted">{ws.description}</p>
                    ) : null}
                    <ul className="mt-2 space-y-1">
                      {ws.sections.map((sec, sj) => (
                        <li key={sj} className="flex items-center gap-2">
                          <input
                            value={sec.title}
                            onChange={(e) => renameSection(si, wi, sj, e.target.value)}
                            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-ink outline-none focus:border-line-strong"
                            aria-label="Section name"
                          />
                          <button
                            type="button"
                            onClick={() => removeSection(si, wi, sj)}
                            aria-label={t("preview_remove")}
                            className="shrink-0 text-[14px] leading-none text-ink-faint transition-base hover:text-claret"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={build}
          disabled={plan.spaces.length === 0}
          className="mt-7 w-full rounded-xl bg-ink px-5 py-3 text-[15px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-40"
        >
          {t("preview_build")}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="px-6 py-5 sm:px-8">
        <Wordmark />
      </header>
      <main className={`flex flex-1 ${wide ? "items-start py-6" : "items-center"} justify-center px-6 pb-16`}>
        {children}
      </main>
    </div>
  );
}
