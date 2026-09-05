import { useQuery } from "@tanstack/react-query";
import { getOnboardingStatus } from "@/lib/onboardingService";

export const ONBOARDING_STATUS_QUERY_KEY = ["onboardingStatus"] as const;

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ONBOARDING_STATUS_QUERY_KEY,
    queryFn: getOnboardingStatus,
    staleTime: 60_000,
  });
}
