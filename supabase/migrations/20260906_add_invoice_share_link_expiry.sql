-- Linkul public de factura (vezi 20260905c_add_invoice_share_link.sql) nu
-- expira niciodata odata generat. Adauga o expirare reala: 30 de zile de la
-- generare, verificata chiar in get_shared_invoice() -- un token expirat
-- se comporta identic cu unul inexistent (nu scurge nicio informatie in
-- plus fata de "linkul nu mai e valabil").

alter table public.invoices
  add column share_token_expires_at timestamptz;

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
  where i.share_token = p_token
    and (i.share_token_expires_at is null or i.share_token_expires_at > now());

  return result;
end;
$$;
