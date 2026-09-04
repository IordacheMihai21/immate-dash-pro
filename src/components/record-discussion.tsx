import { MessageSquare, Send, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddRecordComment,
  useDeleteRecordComment,
  useRecordComments,
} from "@/hooks/use-record-comments";
import type { RecordEntityType } from "@/lib/recordCommentsService";
import { supabase } from "@/lib/supabaseClient";

/**
 * Real accountant <-> company-owner collaboration surface: a comment
 * thread on a specific record (invoice today, extensible to other entity
 * types via RecordEntityType without a schema change). Previously the
 * "Contabil" role only had read access -- no place to actually ask a
 * question about a specific invoice, despite PRODUCT.md already claiming
 * this kind of collaboration as a differentiator.
 */
export function RecordDiscussion({
  entityType,
  entityId,
}: {
  entityType: RecordEntityType;
  entityId: string;
}) {
  const { data: comments, isLoading } = useRecordComments(entityType, entityId);
  const addComment = useAddRecordComment(entityType, entityId);
  const deleteComment = useDeleteRecordComment(entityType, entityId);
  const [draft, setDraft] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        setCurrentUserId(data.user?.id ?? null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.trim() || addComment.isPending) {
      return;
    }

    addComment.mutate(draft, {
      onSuccess: () => setDraft(""),
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4" />
          Discutie {comments && comments.length > 0 ? `(${comments.length})` : ""}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Se incarca discutia...</p>
        ) : !comments || comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nicio intrebare sau observatie inca. Contabilul si administratorii companiei pot discuta
            aici despre aceasta factura.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{comment.authorLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(comment.createdAt).toLocaleString("ro-RO")}
                    </p>
                  </div>
                  {currentUserId && comment.authorAuthUserId === currentUserId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteComment.mutate(comment.id)}
                      disabled={deleteComment.isPending}
                      aria-label="Sterge comentariul"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Scrie o intrebare sau o observatie despre aceasta factura..."
            rows={2}
            maxLength={4000}
            className="flex-1"
          />
          <Button type="submit" disabled={!draft.trim() || addComment.isPending} className="gap-2">
            <Send className="h-4 w-4" />
            Trimite
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
