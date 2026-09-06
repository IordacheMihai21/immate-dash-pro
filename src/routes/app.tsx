import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { MfaVerifyForm } from "@/components/mfa-verify-form";
import { Toaster } from "@/components/ui/sonner";
import { useCompanyPreferences } from "@/hooks/use-company-preferences";
import { getCurrentAuthUser } from "@/lib/appUserService";
import { needsMfaChallenge } from "@/lib/mfaService";

export const Route = createFileRoute("/app")({
  // Real auth guard: supabase.auth.getUser() re-verifies the JWT against
  // Supabase itself (not just "is there something in localStorage"), so a
  // cleared/expired/forged session can't slip past this. Before this guard,
  // /app rendered the full authenticated shell (sidebar, nav, header) for
  // anyone with no session at all -- confirmed live -- and only failed
  // silently once it tried to fetch real data (which RLS correctly blocked,
  // so no data ever leaked, but the UX was wrong and the boundary was in
  // the wrong place).
  beforeLoad: async () => {
    const user = await getCurrentAuthUser();

    if (!user) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mfaGateStatus, setMfaGateStatus] = useState<"checking" | "required" | "clear">("checking");
  const { data: preferences } = useCompanyPreferences();

  useEffect(() => {
    let isMounted = true;

    void needsMfaChallenge().then((required) => {
      if (isMounted) {
        setMfaGateStatus(required ? "required" : "clear");
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (mfaGateStatus === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mfaGateStatus === "required") {
    return <MfaVerifyForm onVerified={() => setMfaGateStatus("clear")} />;
  }

  return (
    <div
      className="immapp-app min-h-screen w-full bg-background text-foreground"
      data-density={preferences?.tableDensity ?? "comfortable"}
    >
      <AppSidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-h-screen md:pl-72">
        <AppHeader onSidebarToggle={() => setSidebarOpen((open) => !open)} />

        <main className="mx-auto flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div key={pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster />
    </div>
  );
}
