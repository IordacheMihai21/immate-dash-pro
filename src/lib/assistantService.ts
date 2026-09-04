import { askAssistant } from "@/lib/api/assistant.functions";
import { supabase } from "@/lib/supabaseClient";

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

async function requireAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Trebuie sa fii autentificat.");
  }

  return token;
}

export async function askFinancialAssistant(
  question: string,
  history: AssistantMessage[],
): Promise<{ answer: string; toolsUsed: string[] }> {
  const accessToken = await requireAccessToken();

  return askAssistant({ data: { accessToken, question, history } });
}
