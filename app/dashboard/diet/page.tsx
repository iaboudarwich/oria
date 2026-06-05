import { redirect } from "next/navigation";

/**
 * Diet now lives as a tab inside the unified Health surface (Round 17). This
 * route redirects so old links, bookmarks, and revalidate paths still land in
 * the right place.
 */
export default function DietRedirect() {
  redirect("/dashboard/health?tab=diet");
}
