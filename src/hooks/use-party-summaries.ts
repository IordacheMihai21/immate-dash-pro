import { useQuery } from "@tanstack/react-query";
import { getCustomerSummaries, getSupplierSummaries } from "@/lib/partyAggregation";

export function useCustomerSummaries() {
  return useQuery({
    queryKey: ["customerSummaries"],
    queryFn: getCustomerSummaries,
    staleTime: 60_000,
  });
}

export function useSupplierSummaries() {
  return useQuery({
    queryKey: ["supplierSummaries"],
    queryFn: getSupplierSummaries,
    staleTime: 60_000,
  });
}
