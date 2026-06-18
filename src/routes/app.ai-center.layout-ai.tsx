import { createFileRoute } from "@tanstack/react-router";
import { LayoutAiAnalysis } from "@/components/layout-ai-analysis";
import { useAiDocumentWorkspace } from "@/hooks/use-ai-document-workspace";

export const Route = createFileRoute("/app/ai-center/layout-ai")({
  head: () => ({ meta: [{ title: "Layout AI - IMMapp" }] }),
  component: LayoutAiPage,
});

function LayoutAiPage() {
  const workspace = useAiDocumentWorkspace();

  return (
    <LayoutAiAnalysis
      analysis={workspace.analysis}
      documentAiFields={workspace.fields}
      verifiedFields={workspace.verifiedFields}
      onApplyFields={workspace.handleApplyLayoutFields}
      onPreparedAnalysis={workspace.handlePreparedAnalysis}
    />
  );
}
