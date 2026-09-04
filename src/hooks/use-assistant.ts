import { useMutation } from "@tanstack/react-query";
import { askFinancialAssistant, type AssistantMessage } from "@/lib/assistantService";

export function useAskAssistant() {
  return useMutation({
    mutationFn: ({ question, history }: { question: string; history: AssistantMessage[] }) =>
      askFinancialAssistant(question, history),
  });
}
