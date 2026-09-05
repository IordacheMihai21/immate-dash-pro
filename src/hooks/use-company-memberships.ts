import { useQuery } from "@tanstack/react-query";
import { getUserCompanyMemberships } from "@/lib/companyMembershipsService";

export function useCompanyMemberships() {
  return useQuery({
    queryKey: ["companyMemberships"],
    queryFn: getUserCompanyMemberships,
    staleTime: 60_000,
  });
}
