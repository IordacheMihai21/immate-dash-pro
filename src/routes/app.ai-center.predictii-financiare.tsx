import { createFileRoute } from "@tanstack/react-router";
import { AiForecastPage } from "@/routes/app.ai-forecast";

export const Route = createFileRoute("/app/ai-center/predictii-financiare")({
  head: () => ({ meta: [{ title: "Predicții financiare - IMMapp" }] }),
  component: AiForecastPage,
});
