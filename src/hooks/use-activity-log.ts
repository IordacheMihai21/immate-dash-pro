import { useQuery } from "@tanstack/react-query";
import { getRecentActivity } from "@/lib/activityLogService";

export function useRecentActivity(limit = 6) {
  return useQuery({
    queryKey: ["activityLog", limit],
    queryFn: () => getRecentActivity(limit),
    staleTime: 30_000,
  });
}
