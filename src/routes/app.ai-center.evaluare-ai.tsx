import { createFileRoute } from "@tanstack/react-router";
import { DocumentAiEvaluation } from "@/components/document-ai-evaluation";
import { useAiDocumentWorkspace } from "@/hooks/use-ai-document-workspace";

export const Route = createFileRoute("/app/ai-center/evaluare-ai")({
  head: () => ({ meta: [{ title: "Evaluare AI - IMMapp" }] }),
  component: EvaluationAiPage,
});

function EvaluationAiPage() {
  const workspace = useAiDocumentWorkspace();

  return (
    <DocumentAiEvaluation
      analysis={workspace.analysis}
      predictedText={workspace.predictedText}
      expectedText={workspace.annotationText}
      expectedFields={workspace.expectedFields}
      result={workspace.evaluationResult}
      onPredictedTextChange={workspace.handlePredictedTextChange}
      onExpectedTextChange={workspace.handleAnnotationChange}
      onExpectedFieldsChange={workspace.handleExpectedFieldsChange}
      onResultChange={workspace.handleEvaluationResultChange}
      onClearAnnotation={workspace.clearAnnotation}
    />
  );
}
