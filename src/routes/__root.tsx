import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import * as Sentry from "@sentry/tanstackstart-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "../components/theme-provider";
import { THEME_INIT_SCRIPT } from "../lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "IMMapp — Document AI și e-Factura pentru IMM-uri" },
      {
        name: "description",
        content:
          "IMMapp centralizează e-Factura, Document AI și rapoarte financiare (cash-flow, TVA, profitabilitate) pentru IMM-uri din România, cu colaborare directă firmă-contabil.",
      },
      { name: "author", content: "IMMapp" },
      { name: "theme-color", content: "#2556e0" },
      { property: "og:title", content: "IMMapp — Document AI și e-Factura pentru IMM-uri" },
      {
        property: "og:description",
        content:
          "Citește automat facturile firmei tale, verifică extractia AI și vezi TVA, cash-flow și risc într-un dashboard clar.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "IMMapp" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "IMMapp — Document AI și e-Factura pentru IMM-uri" },
      {
        name: "twitter:description",
        content:
          "Citește automat facturile firmei tale, verifică extractia AI și vezi TVA, cash-flow și risc într-un dashboard clar.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
    // Routed through head()'s managed scripts (rendered by <HeadContent />)
    // rather than a hand-placed <script> in RootShell: TanStack Router's
    // <Asset>/<Script> renderer applies suppressHydrationWarning directly on
    // this element on both server and client, and produces byte-identical
    // output both times. A raw JSX <script> before <HeadContent /> doesn't
    // get that same-element guarantee and caused a real hydration mismatch
    // on every single page load (server head order didn't match client head
    // order) -- confirmed live via console errors, fixed by this change.
    // Still runs before first paint: the stylesheet <link> above blocks
    // painting, not this script's (synchronous, in-order) execution.
    scripts: [{ children: THEME_INIT_SCRIPT }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT (rendered via head().scripts
    // above, inside HeadContent) sets the .dark class synchronously before
    // hydration, based on localStorage/system preference the server can't
    // know -- without this, React would warn (harmlessly) about a
    // client/server mismatch on this one attribute.
    <html lang="ro" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
