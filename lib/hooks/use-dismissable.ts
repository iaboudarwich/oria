"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Small "open / closed" controller for menus and popovers.
 * Closes when the user clicks outside the returned ref, or hits Escape.
 *
 * Usage:
 *   const { ref, open, setOpen, toggle, close } = useDismissable<HTMLDivElement>();
 *   return <div ref={ref}>...</div>;
 */
export function useDismissable<T extends HTMLElement>(initial = false) {
  const ref = useRef<T>(null);
  const [open, setOpen] = useState(initial);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (ref.current && !ref.current.contains(target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return {
    ref,
    open,
    setOpen,
    toggle: () => setOpen((v) => !v),
    close: () => setOpen(false),
  };
}
