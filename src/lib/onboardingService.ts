import { getActiveCompanyId, getCompanyProfileById } from "./companyService";
import { supabase } from "./supabaseClient";

export type OnboardingStep = {
  id: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
};

export type OnboardingStatus = {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
};

function isProfileComplete(
  profile: {
    company_name: string;
    cui: string;
    address: string;
    city: string;
    county: string;
  } | null,
): boolean {
  if (!profile) return false;

  return Boolean(
    profile.company_name.trim() &&
    profile.cui.trim() &&
    profile.address.trim() &&
    profile.city.trim() &&
    profile.county.trim(),
  );
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const companyId = await getActiveCompanyId();

  const [profile, invoiceCountResult, memberCountResult, documentCountResult] = await Promise.all([
    getCompanyProfileById(companyId),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("company_members")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "active"),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("document_type", "document-ai"),
  ]);

  const steps: OnboardingStep[] = [
    {
      id: "profile",
      label: "Completeaza profilul companiei",
      description: "Denumire, CUI si adresa completa -- necesare pe facturi si rapoarte.",
      done: isProfileComplete(profile),
      href: "/app/setari",
    },
    {
      id: "invoice",
      label: "Adauga prima factura",
      description: "Incarca un XML e-Factura sau creeaza o factura manuala.",
      done: (invoiceCountResult.count ?? 0) > 0,
      href: "/app/e-facturi",
    },
    {
      id: "document-ai",
      label: "Incearca extractia automata cu AI",
      description: "Incarca o factura scanata sau un PDF si lasa Document AI sa extraga datele.",
      done: (documentCountResult.count ?? 0) > 0,
      href: "/app/ai-center/document-ai",
    },
    {
      id: "team",
      label: "Invita un coleg sau contabilul",
      description: "Colaboreaza pe aceleasi date financiare, cu roluri separate.",
      done: (memberCountResult.count ?? 0) > 1,
      href: "/app/setari/utilizatori",
    },
  ];

  return {
    steps,
    completedCount: steps.filter((step) => step.done).length,
    totalCount: steps.length,
  };
}
