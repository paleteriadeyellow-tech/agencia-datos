import { Sidebar } from "@/components/sidebar";
import { AppProviders } from "@/components/app-providers";
import { PageShell } from "@/components/ui";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProviders>
      <Sidebar />
      <PageShell>{children}</PageShell>
    </AppProviders>
  );
}
