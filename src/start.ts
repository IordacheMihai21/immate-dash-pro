import { createStart, createMiddleware } from "@tanstack/react-start";

import { getServerAuthSession } from "./lib/serverAuth.server";
import { renderErrorPage } from "./lib/error-page";

const authMiddleware = createMiddleware().server(async ({ request, next }) => {
  try {
    const authSession = await getServerAuthSession(request);
    const result = await next({ context: { authUser: authSession.user } });

    for (const cookie of authSession.setCookieHeaders) {
      result.response.headers.append("set-cookie", cookie);
    }

    return result;
  } catch (error) {
    console.error("Server auth cookie sync failed.", error);
    return next({ context: { authUser: null } });
  }
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [authMiddleware, errorMiddleware],
}));
