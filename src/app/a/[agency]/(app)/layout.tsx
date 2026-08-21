import { Sidebar } from "@/components/sidebar";
import { AppProviders } from "@/components/app-providers";
import { PageShell } from "@/components/ui";
import { ViewAsBanner } from "@/components/view-as";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProviders>
      <Sidebar />
      <PageShell>
        <ViewAsBanner />
        {children}
      </PageShell>
    </AppProviders>
  );
}
