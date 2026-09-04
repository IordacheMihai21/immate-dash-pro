import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import * as Sentry from "@sentry/tanstackstart-react";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Client-only: server-side (edge/Cloudflare) instrumentation needs a
  // custom server entry and wrangler config this project doesn't expose
  // (deploy is abstracted through Lovable's own Cloudflare pipeline) --
  // see SENTRY_SETUP.md for what that would take and why it's deferred.
  if (!router.isServer && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
      tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    });
  }

  return router;
};
