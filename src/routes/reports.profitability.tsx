import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/reports/profitability")({
  beforeLoad: () => {
    throw redirect({ to: "/app/rapoarte/profitability" });
  },
});
