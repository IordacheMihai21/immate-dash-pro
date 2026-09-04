import { getActiveCompanyId } from "./companyService";
import { supabase } from "./supabaseClient";

export type RecordEntityType = "invoice";

export type RecordComment = {
  id: string;
  entityType: RecordEntityType;
  entityId: string;
  authorAuthUserId: string | null;
  authorLabel: string;
  body: string;
  createdAt: string;
};

type CommentRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  author_auth_user_id: string | null;
  author_label: string;
  body: string;
  created_at: string;
};

function fromRow(row: CommentRow): RecordComment {
  return {
    id: row.id,
    entityType: row.entity_type as RecordEntityType,
    entityId: row.entity_id,
    authorAuthUserId: row.author_auth_user_id,
    authorLabel: row.author_label,
    body: row.body,
    createdAt: row.created_at,
  };
}

const commentColumns =
  "id, entity_type, entity_id, author_auth_user_id, author_label, body, created_at";

export async function getRecordComments(
  entityType: RecordEntityType,
  entityId: string,
): Promise<RecordComment[]> {
  const { data, error } = await supabase
    .from("record_comments")
    .select(commentColumns)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Discutia nu a putut fi incarcata: ${error.message}`);
  }

  return (data as CommentRow[]).map(fromRow);
}

export async function addRecordComment(
  entityType: RecordEntityType,
  entityId: string,
  body: string,
): Promise<RecordComment> {
  const trimmed = body.trim();

  if (!trimmed) {
    throw new Error("Comentariul nu poate fi gol.");
  }

  const companyId = await getActiveCompanyId();

  // author_auth_user_id / author_label are set server-side by a trigger
  // regardless of what's sent here -- see set_record_comment_author() in
  // 20260905_add_record_comments.sql -- so no one can post as someone else.
  const { data, error } = await supabase
    .from("record_comments")
    .insert({ company_id: companyId, entity_type: entityType, entity_id: entityId, body: trimmed })
    .select(commentColumns)
    .single();

  if (error) {
    if (error.code === "42501") {
      throw new Error("Doar proprietarul, un administrator sau contabilul pot posta comentarii.");
    }

    throw new Error(`Comentariul nu a putut fi trimis: ${error.message}`);
  }

  return fromRow(data as CommentRow);
}

export async function deleteRecordComment(commentId: string): Promise<void> {
  const { error } = await supabase.from("record_comments").delete().eq("id", commentId);

  if (error) {
    throw new Error(`Comentariul nu a putut fi sters: ${error.message}`);
  }
}
