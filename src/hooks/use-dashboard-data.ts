import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDashboardData } from "@/lib/dashboardService";

export const DASHBOARD_DATA_QUERY_KEY = ["dashboardData"] as const;

/**
 * Shared cache for the full invoice/company dataset every dashboard and report page
 * derives its numbers from. Navigating between pages no longer re-fetches and
 * re-aggregates the same invoice history from scratch each time.
 */
export function useDashboardData() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_DATA_QUERY_KEY });
    };

    window.addEventListener("immapp:invoice-imported", invalidate);
    window.addEventListener("immapp:invoice-deleted", invalidate);

    return () => {
      window.removeEventListener("immapp:invoice-imported", invalidate);
      window.removeEventListener("immapp:invoice-deleted", invalidate);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: DASHBOARD_DATA_QUERY_KEY,
    queryFn: getDashboardData,
    staleTime: 60_000,
  });
}
