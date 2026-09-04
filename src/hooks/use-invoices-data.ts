import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getInvoices } from "@/lib/invoiceService";

export const INVOICES_DATA_QUERY_KEY = ["invoicesData"] as const;

/** Shared cache for the raw invoice list report pages filter/search over client-side. */
export function useInvoicesData() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_DATA_QUERY_KEY });
    };

    window.addEventListener("immapp:invoice-imported", invalidate);
    window.addEventListener("immapp:invoice-deleted", invalidate);

    return () => {
      window.removeEventListener("immapp:invoice-imported", invalidate);
      window.removeEventListener("immapp:invoice-deleted", invalidate);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: INVOICES_DATA_QUERY_KEY,
    queryFn: getInvoices,
    staleTime: 60_000,
  });
}
