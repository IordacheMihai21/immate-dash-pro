import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bg-[#f6f8fb] text-foreground">
      <AppSidebar
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="min-h-screen md:pl-72">
        <AppHeader onSidebarToggle={() => setSidebarOpen((open) => !open)} />

        <main className="mx-auto flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      <Toaster />
    </div>
  );
}
