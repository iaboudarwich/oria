"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/brand/wordmark";

const SLIDE_MS = 8000;
const NEXT = "/onboarding/conversation";

/**
 * 30-second skim: three one-idea slides that auto-advance (or advance on tap),
 * with a persistent skip. Lands on the conversation either way.
 */
export function DemoClient() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const slides = [t("demo_slide1"), t("demo_slide2"), t("demo_slide3")];

  const advance = useCallback(() => {
    setSlide((s) => {
      if (s >= slides.length - 1) {
        router.push(NEXT);
        return s;
      }
      return s + 1;
    });
  }, [router, slides.length]);

  useEffect(() => {
    const id = window.setTimeout(advance, SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [slide, advance]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center justify-between px-6 py-5 sm:px-8">
        <Wordmark />
        <button
          type="button"
          onClick={() => router.push(NEXT)}
          className="text-[13px] text-ink-muted transition-base hover:text-ink"
        >
          {t("demo_skip")}
        </button>
      </header>

      <button
        type="button"
        onClick={advance}
        aria-label={t("demo_next")}
        className="flex flex-1 cursor-pointer flex-col items-center justify-center px-6 text-center"
      >
        <p
          key={slide}
          className="max-w-xl text-[28px] font-semibold leading-[1.2] tracking-tight text-ink text-balance animate-fade-up sm:text-[40px]"
        >
          {slides[slide]}
        </p>
      </button>

      <footer className="flex items-center justify-center gap-2 px-6 pb-10">
        {slides.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === slide ? "w-6 bg-ink" : "w-1.5 bg-line-strong"
            }`}
            aria-hidden
          />
        ))}
      </footer>
    </div>
  );
}
