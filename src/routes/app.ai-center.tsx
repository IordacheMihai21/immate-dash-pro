import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/ai-center")({
  head: () => ({ meta: [{ title: "AI Center - IMMapp" }] }),
  component: AiCenterLayout,
});

function AiCenterLayout() {
  return <Outlet />;
}
