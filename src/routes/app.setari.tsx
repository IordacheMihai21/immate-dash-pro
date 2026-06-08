import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/setari")({
  head: () => ({ meta: [{ title: "Setari - IMMapp" }] }),
  component: SettingsLayout,
});

function SettingsLayout() {
  return <Outlet />;
}
