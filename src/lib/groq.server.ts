import Groq from "groq-sdk";

// Server-only. GROQ_API_KEY must never reach the browser -- same discipline
// as stripe.server.ts.

export function getAssistantModel(): string {
  const model = process.env.GROQ_ASSISTANT_MODEL;

  if (!model) {
    throw new Error("GROQ_ASSISTANT_MODEL nu este configurat. Adauga-l in .env.");
  }

  return model;
}

let groqClient: Groq | null = null;

export function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("GROQ_API_KEY nu este configurat. Adauga-l in .env (vezi .env.example).");
    }

    groqClient = new Groq({ apiKey });
  }

  return groqClient;
}
