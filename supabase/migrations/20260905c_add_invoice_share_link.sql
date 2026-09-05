-- Link public (fara autentificare) catre o singura factura, pentru a fi
-- trimis unui client. Genereaza/revoca share_token se face printr-un UPDATE
-- normal, deja permis membrilor companiei de policy-ul existent
-- invoices_own_company (is_company_member). Citirea publica insa NU poate
-- trece prin RLS normal: orice policy de forma "using (share_token is not
-- null)" ar face vizibile TOATE facturile partajate ale TUTUROR companiilor
-- oricui interogheaza tabela fara filtru -- exact genul de scurgere reparat
-- deja o data in acest proiect (vezi 20260725b_urgent_fix_public_data_exposure).
-- In schimb, get_shared_invoice(token) e o functie SECURITY DEFINER care
-- cere token-ul exact ca parametru si intoarce un singur JSON scop-limitat
-- (nu "select *"), deci nu poate fi folosita pentru a enumera facturi.

alter table public.invoices
  add column share_token uuid unique;

create index invoices_share_token_idx on public.invoices (share_token) where share_token is not null;

create or replace function public.get_shared_invoice(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  if p_token is null then
    return null;
  end if;

  select jsonb_build_object(
    'invoice_number', i.invoice_number,
    'issue_date', i.issue_date,
    'due_date', i.due_date,
    'currency', i.currency,
    'tax_exclusive_amount', i.tax_exclusive_amount,
    'tax_amount', i.tax_amount,
    'tax_inclusive_amount', i.tax_inclusive_amount,
    'payable_amount', i.payable_amount,
    'payment_status', i.payment_status,
    'supplier', jsonb_build_object(
      'name', s.name, 'cui', s.cui, 'address', s.address, 'city', s.city, 'country', s.country
    ),
    'customer', jsonb_build_object(
      'name', c.name, 'cui', c.cui, 'address', c.address, 'city', c.city, 'country', c.country
    ),
    'lines', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'line_number', l.line_number,
          'description', l.description,
          'quantity', l.quantity,
          'unit_code', l.unit_code,
          'unit_price', l.unit_price,
          'line_total', l.line_total
        )
        order by l.line_number
      )
      from public.invoice_lines l
      where l.invoice_id = i.id
    ), '[]'::jsonb)
  )
  into result
  from public.invoices i
  left join public.suppliers s on s.id = i.supplier_id
  left join public.customers c on c.id = i.customer_id
  where i.share_token = p_token;

  return result;
end;
$$;

revoke all on function public.get_shared_invoice(uuid) from public;
grant execute on function public.get_shared_invoice(uuid) to anon, authenticated;
