import type { ReactNode } from "react";
import { DemoBanner, DemoHeader, DemoTabs } from "@/components/demo/demo-shell";

export const metadata = {
  title: "Oria · Demo",
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <DemoHeader />
      <DemoBanner />
      <DemoTabs />
      <main>
        <div className="mx-auto max-w-[1100px] px-6 py-8 pb-16 sm:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
