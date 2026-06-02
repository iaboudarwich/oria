import { getTranslations } from "next-intl/server";
import { LinkedFilesList, type LinkedFile } from "./linked-files-list";

/**
 * Presentational panel for a section's linked cloud files (Drive + OneDrive).
 * The data is fetched by the page inside its main Promise.all so this adds no
 * serial latency. Renders nothing when the user has neither linked files here
 * nor a file-storage connection to add them with.
 */
export async function LinkedFilesPanel({
  organizationId,
  sectionKey,
  files,
  driveConnected,
  onedriveConnectionId,
}: {
  organizationId: string;
  sectionKey: string;
  files: LinkedFile[];
  driveConnected: boolean;
  onedriveConnectionId?: string | null;
}) {
  if (!driveConnected && !onedriveConnectionId && files.length === 0) return null;
  const t = await getTranslations("cloud");
  return (
    <LinkedFilesList
      organizationId={organizationId}
      sectionKey={sectionKey}
      files={files}
      onedriveConnectionId={onedriveConnectionId}
      labels={{
        heading: t("files_heading"),
        link: t("link_files"),
        connectDrive: t("connect_drive_first"),
        unavailable: t("picker_unavailable"),
        openInDrive: t("open_in_drive"),
        openInOneDrive: t("open_in_onedrive"),
        remove: t("remove"),
        inaccessible: t("inaccessible"),
        empty: t("no_files_yet"),
        view: t("view"),
        onedriveLink: t("onedrive_link_files"),
        ms: {
          link: t("onedrive_link_files"),
          home: t("picker_home"),
          select: t("picker_select"),
          cancel: t("picker_cancel"),
          loading: t("picker_loading"),
          empty: t("picker_empty"),
          error: t("picker_error"),
        },
      }}
    />
  );
}
