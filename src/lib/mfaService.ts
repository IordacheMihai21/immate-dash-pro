import { supabase } from "@/lib/supabaseClient";

export type MfaFactor = {
  id: string;
  friendlyName: string | null;
  status: "verified" | "unverified";
  createdAt: string;
};

export type MfaEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

/**
 * True when this session must complete an MFA challenge before proceeding:
 * the account has a verified factor (nextLevel is aal2) but the current
 * session has not verified one yet (currentLevel is not aal2 already).
 * This is the exact check Supabase's own docs recommend for both the
 * post-login gate and the app-shell gate (a page refresh on an aal1
 * session must not skip the challenge just because it once happened).
 */
export async function needsMfaChallenge(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error) {
    return false;
  }

  return data.nextLevel === "aal2" && data.nextLevel !== data.currentLevel;
}

export async function listVerifiedTotpFactors(): Promise<MfaFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();

  if (error) {
    throw new Error(`Factorii de autentificare nu au putut fi cititi: ${error.message}`);
  }

  return data.totp
    .filter((factor) => factor.status === "verified")
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? null,
      status: factor.status,
      createdAt: factor.created_at,
    }));
}

export async function startTotpEnrollment(): Promise<MfaEnrollment> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });

  if (error) {
    throw new Error(`Activarea autentificarii in doi pasi a esuat: ${error.message}`);
  }

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export async function verifyTotpCode(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });

  if (challengeError) {
    throw new Error(`Verificarea codului a esuat: ${challengeError.message}`);
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });

  if (verifyError) {
    throw new Error(`Cod incorect sau expirat. Incearca din nou.`);
  }
}

export async function cancelTotpEnrollment(factorId: string): Promise<void> {
  await supabase.auth.mfa.unenroll({ factorId });
}

export async function disableMfaFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });

  if (error) {
    throw new Error(`Dezactivarea autentificarii in doi pasi a esuat: ${error.message}`);
  }
}
