import { Link } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
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
import { Input } from "@/components/ui/input";
import {
  getCompanyProfile,
  type CompanyProfile,
} from "@/lib/companyService";
import {
  getCurrentUserProfile,
  type CurrentUserProfile,
} from "@/lib/authUserService";
import { supabase } from "@/lib/supabaseClient";

const fallbackCompany = {
  name: "Compania mea",
  cui: "CUI necompletat",
};

function getCompanyDisplay(profile: CompanyProfile | null | undefined) {
  return {
    name: profile?.company_name?.trim() || fallbackCompany.name,
    cui: profile?.cui?.trim() || fallbackCompany.cui,
  };
}

export function AppHeader({
  onSidebarToggle,
}: {
  onSidebarToggle: () => void;
}) {
  const [darkMode, setDarkMode] = useState(false);
  const [companyDisplay, setCompanyDisplay] = useState(fallbackCompany);
  const [userProfile, setUserProfile] = useState<CurrentUserProfile>({
    displayName: "Utilizator IMMapp",
    email: "",
    initials: "UI",
    role: "Administrator",
  });

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    setDarkMode(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function refreshCompanyProfile() {
      try {
        const profile = await getCompanyProfile();

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
      window.removeEventListener(
        "immapp:company-profile-updated",
        handleProfileUpdated,
      );
      window.removeEventListener(
        "immapp:auth-user-updated",
        handleAuthUserUpdated,
      );
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

  function toggleTheme() {
    if (typeof document === "undefined") {
      return;
    }

    const nextDarkMode = !darkMode;
    document.documentElement.classList.toggle("dark", nextDarkMode);
    setDarkMode(nextDarkMode);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-lg"
          onClick={onSidebarToggle}
          aria-label="Deschide meniul"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="hidden min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 md:flex md:w-[360px] lg:w-[460px]">
          <Search className="h-4 w-4 shrink-0" />
          <Input
            className="h-5 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            placeholder="Cauta sau tasteaza comanda..."
            aria-label="Cauta"
          />
          <span className="ml-auto hidden min-w-12 whitespace-nowrap rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-center text-[11px] text-slate-400 lg:inline-block">
            Ctrl K
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-lg"
            onClick={toggleTheme}
            aria-label="Comuta tema"
            title="Comuta tema"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

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
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notificari</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <NotificationItem
                title="Predictia AI necesita actualizare"
                description="Datele financiare s-au modificat recent."
              />
              <NotificationItem
                title="Documente procesate"
                description="Noile facturi sunt disponibile in dashboard."
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app/ai-forecast">Vezi toate notificarile</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-10 gap-2 rounded-lg px-2"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-blue-500 text-xs text-white">
                    {userProfile.initials}
                  </AvatarFallback>
                </Avatar>

                <div className="hidden min-w-0 text-left leading-tight sm:block">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {userProfile.displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">{userProfile.role}</p>
                </div>

                <ChevronDown className="hidden h-3.5 w-3.5 text-slate-500 sm:block" />
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

function NotificationItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <DropdownMenuItem className="items-start gap-3 py-3">
      <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </DropdownMenuItem>
  );
}
