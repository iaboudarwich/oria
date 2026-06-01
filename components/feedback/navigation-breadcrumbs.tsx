"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordAction } from "@/lib/breadcrumbs";

/**
 * Records a breadcrumb on every client-side navigation. Mounted once near
 * the root so error reports (and the Report-a-problem dialog) arrive with
 * the last several routes the user visited. Path only, never query strings,
 * so signed-URL tokens and search terms stay out of the trail.
 */
export function NavigationBreadcrumbs() {
  const pathname = usePathname();

  useEffect(() => {
    recordAction(`Navigated to ${pathname}`);
  }, [pathname]);

  return null;
}
