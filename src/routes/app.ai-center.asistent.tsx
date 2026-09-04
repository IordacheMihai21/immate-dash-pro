import { createFileRoute } from "@tanstack/react-router";
import { Bot, Loader2, Send, Sparkles, User } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { InfoBanner } from "@/components/admin-ui";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAskAssistant } from "@/hooks/use-assistant";
import type { AssistantMessage } from "@/lib/assistantService";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/ai-center/asistent")({
  head: () => ({ meta: [{ title: "Asistent AI - IMMapp" }] }),
  component: AssistantPage,
});

const SUGGESTED_QUESTIONS = [
  "Cat am facturat luna aceasta?",
  "Care sunt top 5 clienti dupa valoare?",
  "Care clienti au risc ridicat sau mediu?",
  "Care e profitul pe ultimele 90 de zile?",
];

type DisplayMessage = AssistantMessage & { toolsUsed?: string[] };

function AssistantPage() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const askAssistant = useAskAssistant();

  function sendQuestion(question: string) {
    const trimmed = question.trim();

    if (!trimmed || askAssistant.isPending) {
      return;
    }

    const history: AssistantMessage[] = messages.map(({ role, content }) => ({ role, content }));
    const nextMessages: DisplayMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setDraft("");

    askAssistant.mutate(
      { question: trimmed, history },
      {
        onSuccess: (result) => {
          setMessages((current) => [
            ...current,
            { role: "assistant", content: result.answer, toolsUsed: result.toolsUsed },
          ]);
        },
        onError: (error) => {
          setMessages((current) => [
            ...current,
            {
              role: "assistant",
              content:
                error instanceof Error
                  ? `Nu am putut raspunde: ${error.message}`
                  : "Nu am putut raspunde. Incearca din nou.",
            },
          ]);
        },
      },
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    sendQuestion(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendQuestion(draft);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Asistent AI"
        description="Intreaba orice despre datele financiare reale ale companiei -- veniturile, clientii sau riscul de facturare."
      />

      <InfoBanner icon={<Sparkles className="h-4 w-4" />}>
        Raspunsurile sunt generate exclusiv din interogari reale pe facturile companiei tale, nu din
        presupuneri -- daca datele nu sunt suficiente pentru un raspuns, asistentul spune asta clar
        in loc sa ghiceasca.
      </InfoBanner>

      <Card>
        <CardContent className="flex min-h-[480px] flex-col p-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-6 w-6" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Incearca una din intrebarile de mai jos sau scrie-ti propria intrebare despre
                  compania ta.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => sendQuestion(question)}
                      className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-foreground transition hover:border-primary/40 hover:bg-primary/10"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-start gap-3",
                    message.role === "user" ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-primary",
                    )}
                  >
                    {message.role === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.toolsUsed && message.toolsUsed.length > 0 ? (
                      <p className="mt-1.5 text-xs opacity-60">
                        Date folosite: {message.toolsUsed.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))
            )}

            {askAssistant.isPending ? (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verific datele companiei...
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border p-4">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Intreaba despre veniturile, clientii sau riscul companiei tale..."
              rows={2}
              maxLength={2000}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={!draft.trim() || askAssistant.isPending}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              Trimite
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
