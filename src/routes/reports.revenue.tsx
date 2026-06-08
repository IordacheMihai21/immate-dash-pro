import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/reports/revenue")({
  beforeLoad: () => {
    throw redirect({ to: "/app/rapoarte/revenue" });
  },
});
