import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/rapoarte")({
  head: () => ({ meta: [{ title: "Rapoarte - IMMapp" }] }),
  component: ReportsLayout,
});

function ReportsLayout() {
  return <Outlet />;
}
