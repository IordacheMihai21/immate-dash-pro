import { Link } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import type { ReactNode } from "react";

export function LegalHeader() {
  return (
    <header className="border-b border-border px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Gauge className="h-4 w-4" />
          </span>
          <span className="font-semibold">IMMapp</span>
        </Link>
        <Link to="/" className="text-sm text-muted-foreground transition hover:text-foreground">
          Înapoi la pagina principală
        </Link>
      </div>
    </header>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
