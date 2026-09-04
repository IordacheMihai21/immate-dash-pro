import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DEFAULT_COMPANY_PREFERENCES,
  getCompanyPreferences,
  updateCompanyPreferences,
  type CompanyPreferences,
} from "@/lib/companyPreferencesService";

const PREFERENCES_QUERY_KEY = ["company-preferences"];

export function useCompanyPreferences() {
  return useQuery({
    queryKey: PREFERENCES_QUERY_KEY,
    queryFn: getCompanyPreferences,
    staleTime: 30_000,
  });
}

export function useUpdateCompanyPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<Omit<CompanyPreferences, "companyId">>) =>
      updateCompanyPreferences(updates),
    onSuccess: (data) => {
      queryClient.setQueryData(PREFERENCES_QUERY_KEY, data);
      toast.success("Preferintele au fost salvate.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Preferintele nu au putut fi salvate.");
    },
  });
}

export { DEFAULT_COMPANY_PREFERENCES };
