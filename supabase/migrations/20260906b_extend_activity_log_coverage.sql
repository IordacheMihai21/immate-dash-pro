-- Extinde jurnalul de activitate (20260903_add_activity_log.sql) la actiuni
-- adaugate ulterior si care nu erau inca acoperite: stergerea unui document
-- (doar upload-ul era logat), generarea/revocarea unui link public de
-- factura, si sabloanele de facturi recurente (creare/stergere).

-- documents: adauga logare si la DELETE, nu doar la INSERT.
create or replace function public.log_document_upload() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if old.company_id is not null then
      perform public.log_activity(
        old.company_id, 'document', old.id, 'document.deleted',
        'A sters documentul ' || coalesce(old.file_name, ''),
        jsonb_build_object('file_name', old.file_name, 'document_type', old.document_type)
      );
    end if;
    return old;
  end if;

  if new.company_id is not null then
    perform public.log_activity(
      new.company_id, 'document', new.id, 'document.uploaded',
      'A incarcat documentul ' || coalesce(new.file_name, ''),
      jsonb_build_object('file_name', new.file_name, 'document_type', new.document_type)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_document_uploaded on public.documents;

create trigger on_document_change
  after insert or delete on public.documents
  for each row execute function public.log_document_upload();

-- invoices: adauga logare pentru generarea/revocarea link-ului public,
-- pe langa create/delete/payment_status deja acoperite.
create or replace function public.log_invoice_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_activity(
      new.company_id, 'invoice', new.id, 'invoice.created',
      'A adaugat factura ' || coalesce(new.invoice_number, ''),
      jsonb_build_object('invoice_number', new.invoice_number, 'payable_amount', new.payable_amount)
    );
    return new;
  elsif TG_OP = 'DELETE' then
    perform public.log_activity(
      old.company_id, 'invoice', old.id, 'invoice.deleted',
      'A sters factura ' || coalesce(old.invoice_number, ''),
      jsonb_build_object('invoice_number', old.invoice_number)
    );
    return old;
  elsif TG_OP = 'UPDATE' then
    if new.payment_status is distinct from old.payment_status then
      perform public.log_activity(
        new.company_id, 'invoice', new.id, 'invoice.payment_status_changed',
        'A schimbat statusul de plata al facturii ' || coalesce(new.invoice_number, '') || ' in ' || coalesce(new.payment_status, ''),
        jsonb_build_object('invoice_number', new.invoice_number, 'payment_status', new.payment_status)
      );
    end if;

    if new.share_token is distinct from old.share_token then
      if new.share_token is not null then
        perform public.log_activity(
          new.company_id, 'invoice', new.id, 'invoice.share_link_created',
          'A generat un link public pentru factura ' || coalesce(new.invoice_number, ''),
          jsonb_build_object('invoice_number', new.invoice_number)
        );
      else
        perform public.log_activity(
          new.company_id, 'invoice', new.id, 'invoice.share_link_revoked',
          'A revocat linkul public pentru factura ' || coalesce(new.invoice_number, ''),
          jsonb_build_object('invoice_number', new.invoice_number)
        );
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_invoice_change on public.invoices;

create trigger on_invoice_change
  after insert or update or delete on public.invoices
  for each row execute function public.log_invoice_change();

-- recurring_invoice_templates: creare si stergere de sabloane.
create or replace function public.log_recurring_template_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_activity(
      new.company_id, 'recurring_invoice_template', new.id, 'recurring_template.created',
      'A creat sablonul de factura recurenta "' || coalesce(new.template_name, '') || '"',
      jsonb_build_object('template_name', new.template_name, 'frequency', new.frequency)
    );
    return new;
  elsif TG_OP = 'DELETE' then
    perform public.log_activity(
      old.company_id, 'recurring_invoice_template', old.id, 'recurring_template.deleted',
      'A sters sablonul de factura recurenta "' || coalesce(old.template_name, '') || '"',
      jsonb_build_object('template_name', old.template_name)
    );
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists on_recurring_template_change on public.recurring_invoice_templates;

create trigger on_recurring_template_change
  after insert or delete on public.recurring_invoice_templates
  for each row execute function public.log_recurring_template_change();

revoke execute on function public.log_document_upload() from public, anon, authenticated;
revoke execute on function public.log_invoice_change() from public, anon, authenticated;
revoke execute on function public.log_recurring_template_change() from public, anon, authenticated;
