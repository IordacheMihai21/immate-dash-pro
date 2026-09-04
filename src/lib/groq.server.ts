import Groq from "groq-sdk";

// Server-only. GROQ_API_KEY must never reach the browser -- same discipline
// as stripe.server.ts.

// Verified live 2026-09-04 against the actual /v1/models list for this
// account -- llama-3.3-70b-versatile (used in most Groq docs/examples as
// of this codebase's knowledge) has been deprecated/removed since. Groq
// rotates its hosted model lineup frequently; if this starts 404ing again,
// check `curl https://api.groq.com/openai/v1/models` for what's currently
// live before guessing a replacement.
export const ASSISTANT_MODEL = "openai/gpt-oss-20b";

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
