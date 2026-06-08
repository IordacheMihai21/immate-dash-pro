import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/reports/cash-flow")({
  beforeLoad: () => {
    throw redirect({ to: "/app/rapoarte/cash-flow" });
  },
});
