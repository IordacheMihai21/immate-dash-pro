import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDocuments } from "@/lib/invoiceService";

export const DOCUMENTS_DATA_QUERY_KEY = ["documentsData"] as const;

/** Shared cache for the raw document list, invalidated alongside invoice changes. */
export function useDocumentsData() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_DATA_QUERY_KEY });
    };

    window.addEventListener("immapp:invoice-imported", invalidate);
    window.addEventListener("immapp:invoice-deleted", invalidate);

    return () => {
      window.removeEventListener("immapp:invoice-imported", invalidate);
      window.removeEventListener("immapp:invoice-deleted", invalidate);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: DOCUMENTS_DATA_QUERY_KEY,
    queryFn: () => getDocuments().catch(() => []),
    staleTime: 60_000,
  });
}
