import { Gauge } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Gauge className="h-4 w-4" />
            </span>
            <span className="font-semibold">IMMapp</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
            Sistem financiar pentru IMM-uri din Romania: facturi, documente, rapoarte si AI.
          </p>
        </div>

        <div className="grid gap-8 text-sm sm:grid-cols-3">
          <FooterGroup
            title="Produs"
            links={[
              ["Functionalitati", "/#functionalitati"],
              ["Workflow", "/#workflow"],
              ["Rapoarte", "/#rapoarte"],
              ["Preturi", "/preturi"],
            ]}
          />
          <FooterGroup
            title="Cont"
            links={[
              ["Autentificare", "/login"],
              ["Incepe gratuit", "/register"],
            ]}
          />
          <FooterGroup
            title="Legal"
            links={[
              ["Confidentialitate", "/confidentialitate"],
              ["Termeni", "/termeni"],
            ]}
          />
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <div className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <a
            key={label}
            href={href}
            className="block text-muted-foreground transition hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
