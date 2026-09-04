import { useQuery } from "@tanstack/react-query";
import { getSubscription } from "@/lib/subscriptionService";

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: getSubscription,
    staleTime: 30_000,
  });
}
