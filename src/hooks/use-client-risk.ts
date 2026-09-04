import { useQuery } from "@tanstack/react-query";
import { getCustomerRiskProfiles } from "@/lib/clientRiskService";

export function useCustomerRiskProfiles() {
  return useQuery({
    queryKey: ["customerRiskProfiles"],
    queryFn: getCustomerRiskProfiles,
    staleTime: 60_000,
  });
}
