"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";

/**
 * Bottom sheet, the native-feel replacement for full-screen modal takeovers
 * (Round 16.9). Built on vaul (Radix Dialog underneath): accessible, focus
 * trapped, swipe-to-dismiss, Escape + overlay-tap to close, and it honors
 * prefers-reduced-motion. Token-styled. Full width at the bottom on phones; a
 * centered card near the bottom on larger screens. Use for quick forms, row
 * actions, filters, and capture, anywhere context should stay visible behind.
 *
 * Controlled: pass `open` + `onOpenChange`. RTL inherits the document `dir`
 * (the sheet is vertical, so nothing to mirror).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | null;
  children: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-ink/40 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[110] mx-auto flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface-floating outline-none sm:bottom-4 sm:max-w-md sm:rounded-2xl">
          <Drawer.Handle className="mx-auto mt-3 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" />
          <div className="min-h-0 overflow-y-auto px-5 pt-2 pb-[calc(20px+env(safe-area-inset-bottom))]">
            <Drawer.Title className="text-[15px] font-semibold text-ink">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-0.5 text-[11.5px] text-ink-faint">
                {description}
              </Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
            <div className="mt-3">{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
