import { createFileRoute } from "@tanstack/react-router";
import { AiForecastPage } from "@/components/pages/ai-forecast-page";

export const Route = createFileRoute("/app/ai-forecast")({
  head: () => ({ meta: [{ title: "AI Forecast - IMMapp" }] }),
  component: AiForecastPage,
});
