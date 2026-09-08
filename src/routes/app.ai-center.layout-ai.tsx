import { createFileRoute } from "@tanstack/react-router";
import { LayoutAiAnalysis } from "@/components/layout-ai-analysis";
import { useAiDocumentWorkspace } from "@/hooks/use-ai-document-workspace";
import { requireStaffAccess } from "@/lib/staffOnlyRouteGuard";

// Staff-only: Document AI's own "Analizeaza factura" already runs this
// exact pipeline end to end (finalizeDocumentAiWithHybrid calls the same
// analyzeLayoutWithBackend + mergeLayoutXlmWithCandidateEngine this page
// calls separately) and folds it into one calibrated, confidence-gated
// result. This page instead shows the raw LayoutXLM-vs-candidate-engine
// comparison table -- genuinely useful for sanity-checking model behavior
// on a specific document, but exposes pipeline internals no customer
// needs or should have to reason about.
export const Route = createFileRoute("/app/ai-center/layout-ai")({
  beforeLoad: ({ serverContext }) => requireStaffAccess(serverContext),
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
