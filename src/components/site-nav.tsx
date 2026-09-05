import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Gauge } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5">
      <div
        className={cn(
          "mx-auto flex h-16 w-full max-w-6xl items-center rounded-2xl border bg-card/85 px-3 text-sm backdrop-blur-xl transition-all duration-300 sm:px-5",
          scrolled
            ? "border-border shadow-[0_14px_40px_rgba(37,58,146,0.1)]"
            : "border-foreground/5",
        )}
      >
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="IMMapp">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Gauge className="h-4 w-4" />
          </span>
          <span className="font-semibold">IMMapp</span>
        </Link>

        <nav className="mx-auto hidden items-center gap-7 text-[13px] font-medium text-muted-foreground md:flex">
          <a href="/#functionalitati" className="transition hover:text-foreground">
            Functionalitati
          </a>
          <a
            href="/#workflow"
            className="inline-flex items-center gap-1 transition hover:text-foreground"
          >
            Workflow
            <ChevronDown className="h-3 w-3" />
          </a>
          <a href="/#rapoarte" className="transition hover:text-foreground">
            Rapoarte
          </a>
          <a href="/#securitate" className="transition hover:text-foreground">
            Securitate
          </a>
          <Link to="/preturi" className="transition hover:text-foreground">
            Preturi
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />

          <Button variant="ghost" size="sm" asChild className="hidden h-9 rounded-lg px-3 sm:flex">
            <Link to="/login">Autentificare</Link>
          </Button>
          <Button
            size="sm"
            asChild
            className="h-9 rounded-lg bg-primary px-2.5 text-primary-foreground shadow-[0_10px_24px_rgba(37,86,224,0.28)] hover:bg-primary/90 sm:px-4"
          >
            <Link to="/register">
              <span className="hidden min-[430px]:inline">Incepe gratuit</span>
              <span className="min-[430px]:hidden">Start</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
