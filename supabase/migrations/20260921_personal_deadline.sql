-- Separate personal calendar data from the club calendar in the same project.
create table if not exists public.personal_deadline_invites (
  code_hash text primary key,
  uses integer not null default 0 check (uses >= 0),
  max_uses integer not null default 3 check (max_uses > 0),
  created_at timestamptz not null default now()
);
create table if not exists public.personal_deadline_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);
create table if not exists public.personal_deadline_calendars (
  user_id uuid primary key references public.personal_deadline_members(user_id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.personal_deadline_invites enable row level security;
alter table public.personal_deadline_members enable row level security;
alter table public.personal_deadline_calendars enable row level security;
revoke all on public.personal_deadline_invites from anon, authenticated;
revoke all on public.personal_deadline_members from anon, authenticated;
revoke all on public.personal_deadline_calendars from anon;
grant select on public.personal_deadline_members to authenticated;
grant select on public.personal_deadline_calendars to authenticated;
grant select, insert, update on public.personal_deadline_calendars to authenticated;
grant select, update on public.personal_deadline_invites to service_role;
grant select, insert on public.personal_deadline_members to service_role;
create policy "Member reads self" on public.personal_deadline_members for select to authenticated using ((select auth.uid()) = user_id);
create policy "Member reads calendar" on public.personal_deadline_calendars for select to authenticated using ((select auth.uid()) = user_id and exists (select 1 from public.personal_deadline_members m where m.user_id = (select auth.uid())));
create policy "Member inserts calendar" on public.personal_deadline_calendars for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.personal_deadline_members m where m.user_id = (select auth.uid())));
create policy "Member updates calendar" on public.personal_deadline_calendars for update to authenticated using ((select auth.uid()) = user_id and exists (select 1 from public.personal_deadline_members m where m.user_id = (select auth.uid()))) with check ((select auth.uid()) = user_id and exists (select 1 from public.personal_deadline_members m where m.user_id = (select auth.uid())));
-- Service-role-only invitation redemption; atomic seat assignment.
create or replace function public.redeem_personal_deadline_invite(p_hash text,p_user uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.personal_deadline_members where user_id=p_user) then return true; end if;
  update public.personal_deadline_invites set uses=uses+1
  where code_hash=p_hash and uses<max_uses;
  if not found then return false; end if;
  insert into public.personal_deadline_members(user_id) values(p_user);
  return true;
end $$;
revoke all on function public.redeem_personal_deadline_invite(text,uuid) from public,anon,authenticated;
grant execute on function public.redeem_personal_deadline_invite(text,uuid) to service_role;
-- Conflict-aware write so a second device cannot silently overwrite the first.
create or replace function public.save_personal_deadline(p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare row_record public.personal_deadline_calendars%rowtype;
begin
  if (select auth.uid()) is null or not exists
    (select 1 from public.personal_deadline_members where user_id=(select auth.uid())) then
    raise exception 'Not a calendar member' using errcode='42501';
  end if;
  select * into row_record from public.personal_deadline_calendars
  where user_id=(select auth.uid()) for update;
  if not found then
    if p_revision<>0 then return jsonb_build_object('ok',false,'revision',0); end if;
    insert into public.personal_deadline_calendars(user_id,data,revision)
    values((select auth.uid()),p_data,1);
    return jsonb_build_object('ok',true,'revision',1);
  end if;
  if row_record.revision<>p_revision then
    return jsonb_build_object('ok',false,'revision',row_record.revision);
  end if;
  update public.personal_deadline_calendars
  set data=p_data,revision=revision+1,updated_at=now()
  where user_id=(select auth.uid());
  return jsonb_build_object('ok',true,'revision',p_revision+1);
end $$;
revoke all on function public.save_personal_deadline(bigint,jsonb) from public,anon;
grant execute on function public.save_personal_deadline(bigint,jsonb) to authenticated;
