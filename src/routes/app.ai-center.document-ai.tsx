import { createFileRoute } from "@tanstack/react-router";
import { DocumentAiUpload } from "@/components/document-ai-upload";
import { useAiDocumentWorkspace } from "@/hooks/use-ai-document-workspace";

export const Route = createFileRoute("/app/ai-center/document-ai")({
  head: () => ({ meta: [{ title: "Document AI - IMMapp" }] }),
  component: DocumentAiPage,
});

function DocumentAiPage() {
  const workspace = useAiDocumentWorkspace();

  return (
    <DocumentAiUpload
      analysis={workspace.analysis}
      editableFields={workspace.fields}
      verifiedFields={workspace.verifiedFields}
      onAnalysisChange={workspace.handleAnalysisChange}
      onEditableFieldsChange={workspace.handleFieldsChange}
      onVerifiedFieldsChange={workspace.handleVerifiedFieldsChange}
      onClearAnalysis={workspace.clearAnalysis}
    />
  );
}
