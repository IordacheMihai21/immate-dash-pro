-- Permite unui utilizator invitat sa vada ca are o invitatie in asteptare
-- (potrivind emailul verificat din JWT) inainte sa o revendice.
drop policy if exists company_members_select_own_invite on public.company_members;

create policy company_members_select_own_invite
  on public.company_members
  for select
  using (
    status = 'invited'
    and auth_user_id is null
    and invited_email is not null
    and lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Revendicarea propriu-zisa se face printr-o functie SECURITY DEFINER, nu
-- printr-un UPDATE direct din client: un UPDATE prin RLS ar cere ca randul
-- rezultat sa treaca si el de o policy de SELECT (is_company_member), dar
-- utilizatorul tocmai devine membru prin acest pas -- e o dependenta
-- circulara care blocheaza orice UPDATE, indiferent cum e scrisa policy-ul.
-- Functia ocoleste RLS-ul intern, dar ramane sigura pentru ca actioneaza
-- strict pe baza auth.uid()/auth.jwt() ale apelantului (verificate de
-- Supabase la nivel de JWT, nu pot fi falsificate din client) si scrie
-- doar in randul care are exact emailul lor invitat.
create or replace function public.claim_company_invite()
returns table (company_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimer_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  claimed_company_id uuid;
  claimed_role text;
begin
  if auth.uid() is null or claimer_email = '' then
    return;
  end if;

  update public.company_members cm
  set auth_user_id = auth.uid(),
      status = 'active',
      updated_at = now()
  where cm.status = 'invited'
    and cm.auth_user_id is null
    and lower(cm.invited_email) = claimer_email
  returning cm.company_id, cm.role into claimed_company_id, claimed_role;

  if claimed_company_id is null then
    return;
  end if;

  return query select claimed_company_id, claimed_role;
end;
$$;

grant execute on function public.claim_company_invite() to authenticated;
