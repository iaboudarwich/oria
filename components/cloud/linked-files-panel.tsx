import { getTranslations } from "next-intl/server";
import { LinkedFilesList, type LinkedFile } from "./linked-files-list";

/**
 * Presentational panel for a section's linked Drive files. The data (files +
 * whether the user has a Drive connection) is fetched by the page inside its
 * main Promise.all so this adds no serial latency. Renders nothing when the
 * user has neither linked files here nor a Drive connection to add them with.
 */
export async function LinkedFilesPanel({
  organizationId,
  sectionKey,
  files,
  driveConnected,
}: {
  organizationId: string;
  sectionKey: string;
  files: LinkedFile[];
  driveConnected: boolean;
}) {
  if (!driveConnected && files.length === 0) return null;
  const t = await getTranslations("cloud");
  return (
    <LinkedFilesList
      organizationId={organizationId}
      sectionKey={sectionKey}
      files={files}
      labels={{
        heading: t("files_heading"),
        link: t("link_files"),
        connectDrive: t("connect_drive_first"),
        unavailable: t("picker_unavailable"),
        openInDrive: t("open_in_drive"),
        remove: t("remove"),
        inaccessible: t("inaccessible"),
        empty: t("no_files_yet"),
      }}
    />
  );
}
