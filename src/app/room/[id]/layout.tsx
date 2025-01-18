import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CallControlsBar } from "@/components/call-controls-bar";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "19rem",
        } as React.CSSProperties
      }
    >
      <SidebarInset>{children}</SidebarInset>
      <AppSidebar />

      <CallControlsBar />
    </SidebarProvider>
  );
}
