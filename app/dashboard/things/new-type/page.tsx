import { Topbar } from "@/components/dashboard/topbar";
import { NewEntityTypeForm } from "@/components/things/new-entity-type-form";

export const metadata = { title: "New entity type" };

export default function NewEntityTypePage() {
  return (
    <>
      <Topbar title="New entity type" />
      <div className="animate-fade-up mx-auto max-w-xl">
        <NewEntityTypeForm />
      </div>
    </>
  );
}
