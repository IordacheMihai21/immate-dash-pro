import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Info,
  LogOut,
  Menu,
  Search,
  Settings,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandMenu } from "@/components/command-menu";
import { useCompanyMemberships } from "@/hooks/use-company-memberships";
import { useCompanyPreferences } from "@/hooks/use-company-preferences";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  getActiveCompanyId,
  getCompanyProfileById,
  getSelectedCompanyId,
  reloadForCompanySwitch,
  setSelectedCompanyId,
  type CompanyProfile,
} from "@/lib/companyService";
import { getCurrentUserProfile, type CurrentUserProfile } from "@/lib/authUserService";
import { getDashboardNotifications, type AppNotification } from "@/lib/notifications";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

const fallbackCompany = {
  name: "Compania mea",
  cui: "CUI necompletat",
};

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? "");

function getCompanyDisplay(profile: CompanyProfile | null | undefined) {
  return {
    name: profile?.company_name?.trim() || fallbackCompany.name,
    cui: profile?.cui?.trim() || fallbackCompany.cui,
  };
}

export function AppHeader({ onSidebarToggle }: { onSidebarToggle: () => void }) {
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const { data: dashboardData } = useDashboardData();
  const { data: preferences } = useCompanyPreferences();
  const notifications = getDashboardNotifications(dashboardData, preferences);
  const hasAttentionNotification = notifications.some(
    (notification) => notification.tone === "risk" || notification.tone === "warning",
  );
  const [companyDisplay, setCompanyDisplay] = useState(fallbackCompany);
  const { data: memberships } = useCompanyMemberships();
  const [userProfile, setUserProfile] = useState<CurrentUserProfile>({
    displayName: "Utilizator IMMapp",
    email: "",
    initials: "UI",
    role: "Administrator",
  });

  useEffect(() => {
    let isMounted = true;

    async function refreshCompanyProfile() {
      try {
        // The active company, not necessarily one the current auth user
        // personally owns -- see getCompanyProfileById's doc comment.
        const companyId = await getActiveCompanyId();
        const profile = await getCompanyProfileById(companyId);

        if (isMounted) {
          setCompanyDisplay(getCompanyDisplay(profile));
        }
      } catch {
        if (isMounted) {
          setCompanyDisplay(fallbackCompany);
        }
      }
    }

    function handleProfileUpdated(event: Event) {
      const updatedProfile = (event as CustomEvent<CompanyProfile>).detail;
      setCompanyDisplay(getCompanyDisplay(updatedProfile));
    }

    function handleAuthUserUpdated() {
      void refreshCompanyProfile();
    }

    void refreshCompanyProfile();
    window.addEventListener("immapp:company-profile-updated", handleProfileUpdated);
    window.addEventListener("immapp:auth-user-updated", handleAuthUserUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener("immapp:company-profile-updated", handleProfileUpdated);
      window.removeEventListener("immapp:auth-user-updated", handleAuthUserUpdated);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function refreshUserProfile() {
      const profile = await getCurrentUserProfile();

      if (isMounted) {
        setUserProfile(profile);
      }
    }

    void refreshUserProfile();

    const { data } = supabase.auth.onAuthStateChange(() => {
      void refreshUserProfile();
      window.dispatchEvent(new Event("immapp:auth-user-updated"));
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  function handleSignOut() {
    void supabase.auth.signOut();
  }

  function handleSwitchCompany(companyId: string) {
    if (companyId === getSelectedCompanyId()) {
      return;
    }

    setSelectedCompanyId(companyId);
    reloadForCompanySwitch();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full"
          onClick={onSidebarToggle}
          aria-label="Deschide meniul"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <button
          type="button"
          onClick={() => setCommandMenuOpen(true)}
          className="hidden min-w-0 items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-sm text-muted-foreground transition hover:border-primary/30 hover:text-foreground md:flex md:w-[360px] lg:w-[460px]"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Cauta sau tasteaza o comanda...</span>
          <span className="ml-auto hidden min-w-12 whitespace-nowrap rounded-md border border-border bg-card px-1.5 py-0.5 text-center text-[11px] text-muted-foreground lg:inline-block">
            {isMac ? "⌘K" : "Ctrl K"}
          </span>
        </button>

        <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative rounded-lg"
                aria-label="Notificari"
              >
                <Bell className="h-4 w-4" />
                {notifications.length > 0 ? (
                  <span
                    className={cn(
                      "absolute right-2 top-2 h-2 w-2 rounded-full ring-2 ring-background",
                      hasAttentionNotification ? "bg-destructive" : "bg-primary",
                    )}
                  />
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notificari</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  Nimic nou momentan.
                </p>
              ) : (
                notifications.map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} />
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app">Vezi panoul principal</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" className="h-10 gap-2 rounded-full px-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    {userProfile.initials}
                  </AvatarFallback>
                </Avatar>

                <div className="hidden min-w-0 text-left leading-tight sm:block">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {userProfile.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{userProfile.role}</p>
                </div>

                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <span className="block text-sm">Contul meu</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {companyDisplay.name}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app/setari">
                  <User className="h-4 w-4" />
                  Profil companie
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/app/setari/preferinte">
                  <Settings className="h-4 w-4" />
                  Preferinte
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Building2 className="h-4 w-4" />
                {companyDisplay.cui}
              </DropdownMenuItem>
              {memberships && memberships.length > 1 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Companiile tale
                  </DropdownMenuLabel>
                  {memberships.map((membership) => (
                    <DropdownMenuItem
                      key={membership.companyId}
                      onClick={() => handleSwitchCompany(membership.companyId)}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          membership.cui && membership.cui === companyDisplay.cui
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      <span className="truncate">{membership.companyName}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem asChild>
                    <Link to="/app/portofoliu">
                      <Building2 className="h-4 w-4" />
                      Vezi toate companiile
                    </Link>
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/login" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  Deconectare
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

const notificationToneStyles: Record<AppNotification["tone"], string> = {
  risk: "bg-destructive/15 text-destructive",
  warning: "bg-warning/20 text-warning",
  info: "bg-primary/15 text-primary",
  success: "bg-success/20 text-success",
};

const notificationToneIcons: Record<AppNotification["tone"], typeof Bell> = {
  risk: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

function NotificationItem({ notification }: { notification: AppNotification }) {
  const Icon = notificationToneIcons[notification.tone];

  return (
    <DropdownMenuItem className="items-start gap-3 py-3" asChild>
      <Link to={notification.href}>
        <span
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            notificationToneStyles[notification.tone],
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span>
          <span className="block text-sm font-medium">{notification.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {notification.description}
          </span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}
