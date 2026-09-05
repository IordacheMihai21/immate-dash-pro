import { useQuery } from "@tanstack/react-query";
import { getClientPortfolio } from "@/lib/clientPortfolioService";

export function useClientPortfolio() {
  return useQuery({
    queryKey: ["clientPortfolio"],
    queryFn: getClientPortfolio,
    staleTime: 60_000,
  });
}
