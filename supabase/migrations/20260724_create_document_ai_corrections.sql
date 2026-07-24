create table if not exists public.document_ai_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_profiles(id) on delete cascade,
  document_id text not null,
  file_name text not null,
  field_name text not null,
  previous_predicted_value text not null,
  corrected_value text not null,
  ocr_text text,
  ocr_words jsonb not null default '[]'::jsonb,
  previous_method text,
  previous_confidence numeric,
  source_text text,
  created_at timestamptz not null default now()
);

create unique index if not exists document_ai_corrections_dedupe_idx
  on public.document_ai_corrections (company_id, document_id, field_name, corrected_value);

create index if not exists document_ai_corrections_company_idx
  on public.document_ai_corrections (company_id);

alter table public.document_ai_corrections enable row level security;

drop policy if exists document_ai_corrections_own_company on public.document_ai_corrections;

create policy document_ai_corrections_own_company
  on public.document_ai_corrections
  for all
  using (
    exists (
      select 1
      from public.company_profiles cp
      where cp.id = document_ai_corrections.company_id
        and cp.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.company_profiles cp
      where cp.id = document_ai_corrections.company_id
        and cp.auth_user_id = auth.uid()
    )
  );
