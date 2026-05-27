"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Sidebar, type SidebarProps } from "@/components/dashboard/sidebar";

const SIDEBAR_COOKIE = "oria_sidebar";
const SECTIONS_COOKIE = "oria_sections";
const SIDEBAR_WIDTH_COOKIE = "oria_sidebar_w";
const ONE_YEAR = 60 * 60 * 24 * 365;

const COLLAPSED_WIDTH = 64;
const MIN_WIDTH = 200;
const MAX_WIDTH = 420;

type Props = {
  initialCollapsed: boolean;
  initialSectionsOpen: boolean;
  initialWidth: number;
  sidebarProps: SidebarProps;
  children: ReactNode;
};

/**
 * Holds the sidebar's collapsed state, the Sections-group open state, and
 * the user-resized expanded width. Drives a CSS variable that both the
 * sidebar AND the main content padding read from, so width changes stay in
 * sync. All three preferences persist via cookies (written client-side so
 * the server's next render picks them up without a refresh).
 */
export function SidebarShell({
  initialCollapsed,
  initialSectionsOpen,
  initialWidth,
  sidebarProps,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [sectionsOpen, setSectionsOpen] = useState(initialSectionsOpen);
  const [width, setWidth] = useState(initialWidth);
  const [dragging, setDragging] = useState(false);
  // Mirror width into a ref so the pointerup handler can read the *latest*
  // value at the end of a drag without re-binding listeners every render.
  const widthRef = useRef(initialWidth);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
  }

  function toggleSectionsOpen() {
    const next = !sectionsOpen;
    setSectionsOpen(next);
    document.cookie = `${SECTIONS_COOKIE}=${next ? "open" : "closed"}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
  }

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (collapsed) return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;
      setDragging(true);

      function onMove(ev: PointerEvent) {
        const next = Math.max(
          MIN_WIDTH,
          Math.min(MAX_WIDTH, startW + (ev.clientX - startX)),
        );
        setWidth(next);
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        setDragging(false);
        document.cookie = `${SIDEBAR_WIDTH_COOKIE}=${Math.round(
          widthRef.current,
        )}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [collapsed],
  );

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : width;

  return (
    <div
      className={`${collapsed ? "sidebar-collapsed" : "sidebar-expanded"} ${
        dragging ? "sidebar-dragging" : ""
      }`}
      style={
        {
          // Inline override so width updates take effect immediately; the
          // .sidebar-expanded / .sidebar-collapsed classes only set fallbacks.
          "--sidebar-w": `${effectiveWidth}px`,
        } as React.CSSProperties
      }
    >
      <Sidebar
        {...sidebarProps}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        sectionsOpen={sectionsOpen}
        onToggleSections={toggleSectionsOpen}
      />

      {/* Drag handle. Only visible on lg+ and only when expanded. Sits at
       * the right edge of the sidebar, positioned with the same CSS var. */}
      {!collapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={startResize}
          className="group fixed bottom-0 top-0 z-50 hidden w-1.5 cursor-col-resize lg:block"
          style={{
            left: `calc(var(--sidebar-w) - 3px)`,
          }}
        >
          {/* Visible grip line on hover/active for affordance. */}
          <div
            className={`mx-auto h-full w-px transition-colors duration-150 ${
              dragging
                ? "bg-ink-muted"
                : "bg-transparent group-hover:bg-line-strong"
            }`}
          />
        </div>
      ) : null}

      <div className="sidebar-content lg:pl-[var(--sidebar-w)] transition-[padding] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]">
        <div className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-6 lg:px-10">
          {children}
        </div>
      </div>
    </div>
  );
}
