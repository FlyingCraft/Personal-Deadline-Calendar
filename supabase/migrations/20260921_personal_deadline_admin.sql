-- Extend only the personal calendar's authorization model.
alter table public.personal_deadline_members
  add column username text,
  add column is_admin boolean not null default false;
create unique index personal_deadline_username_unique on public.personal_deadline_members (lower(username));
alter table public.personal_deadline_invites
  add column kind text not null default 'member' check (kind in ('member','admin'));
-- An invite grants admin rights only when a separate, one-time admin invite is redeemed.
create or replace function public.redeem_personal_deadline_invite(p_hash text,p_user uuid,p_username text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare invite_kind text;
begin
  if p_username !~ '^[A-Za-z0-9_]{3,24}$' then return false; end if;
  if exists (select 1 from public.personal_deadline_members where user_id=p_user) then return true; end if;
  update public.personal_deadline_invites set uses=uses+1
  where code_hash=p_hash and uses<max_uses
  returning kind into invite_kind;
  if invite_kind is null then return false; end if;
  if (lower(p_username)='flying_craft') <> (invite_kind='admin') then
    raise exception 'Admin name requires its own invitation';
  end if;
  insert into public.personal_deadline_members(user_id,username,is_admin)
  values(p_user,p_username,invite_kind='admin');
  return true;
end $$;
revoke all on function public.redeem_personal_deadline_invite(text,uuid,text) from public,anon,authenticated;
grant execute on function public.redeem_personal_deadline_invite(text,uuid,text) to service_role;
-- Remove the former two-parameter path so it cannot bypass the username check.
drop function public.redeem_personal_deadline_invite(text,uuid);
