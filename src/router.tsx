import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Client-only, and dynamically imported: server-side Sentry instrumentation
  // needs a custom server entry this project doesn't expose (see
  // SENTRY_SETUP.md), and @sentry/tanstackstart-react pulls its @sentry/node
  // -> OpenTelemetry -> import-in-the-middle chain along with it, which
  // crashes Nitro's node-server build (Rollup's renderModules throws on
  // import-in-the-middle's generated re-exports -- reproduced with caches
  // cleared, this is a real Rollup/OTel incompatibility, not stale state).
  // The `import.meta.env.SSR` check (a build-time constant, unlike
  // router.isServer) is what actually keeps this out of the server bundle:
  // Vite dead-code-eliminates the whole branch there, so the dynamic
  // import() never becomes a traced server chunk in the first place.
  if (!import.meta.env.SSR && import.meta.env.VITE_SENTRY_DSN) {
    void import("@sentry/tanstackstart-react").then((Sentry) => {
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
        tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
      });
    });
  }

  return router;
};
