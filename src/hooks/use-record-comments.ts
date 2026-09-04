import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addRecordComment,
  deleteRecordComment,
  getRecordComments,
  type RecordEntityType,
} from "@/lib/recordCommentsService";

function commentsQueryKey(entityType: RecordEntityType, entityId: string) {
  return ["recordComments", entityType, entityId] as const;
}

export function useRecordComments(entityType: RecordEntityType, entityId: string) {
  return useQuery({
    queryKey: commentsQueryKey(entityType, entityId),
    queryFn: () => getRecordComments(entityType, entityId),
    staleTime: 15_000,
  });
}

export function useAddRecordComment(entityType: RecordEntityType, entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: string) => addRecordComment(entityType, entityId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey(entityType, entityId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Comentariul nu a putut fi trimis.");
    },
  });
}

export function useDeleteRecordComment(entityType: RecordEntityType, entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) => deleteRecordComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey(entityType, entityId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Comentariul nu a putut fi sters.");
    },
  });
}
