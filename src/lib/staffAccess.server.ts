// Server-only. Gates the internal ML tooling routes (Evaluare AI,
// Monitorizare AI) to IMMapp's own team -- these expose raw model
// benchmarks and ground-truth annotations, not something any customer
// (regardless of their own company role) has a use for.
//
// IMMAPP_STAFF_EMAILS is intentionally NOT VITE_-prefixed: it must never
// reach the client bundle.

function parseAllowlist(): Set<string> {
  const raw = process.env.IMMAPP_STAFF_EMAILS ?? "";

  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  return parseAllowlist().has(email.trim().toLowerCase());
}
