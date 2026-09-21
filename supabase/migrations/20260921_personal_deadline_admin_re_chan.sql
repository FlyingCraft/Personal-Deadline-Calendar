-- Auth's club trigger runs before app_metadata can always be relied on.
-- The personal calendar server alone creates accounts with this reserved
-- internal email pattern; member access still requires redeeming an invite.
create or replace function public.handle_club_calendar_user()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  uname text;
  ukey text;
  cid uuid;
begin
  if new.raw_app_meta_data->>'personal_deadline_account' = 'true'
     or lower(new.email) ~ '^u[0-9a-f]{6,48}@accounts[.]example[.]com$' then
    return new;
  end if;
  uname := trim(coalesce(new.raw_user_meta_data->>'username',''));
  ukey := trim(coalesce(new.raw_user_meta_data->>'username_key',''));
  if char_length(uname) < 2 or char_length(uname) > 24 or char_length(ukey) < 2 then
    raise exception 'invalid username';
  end if;
  insert into public.profiles(user_id, username, username_key, nickname)
    values(new.id, uname, ukey, uname);
  insert into public.calendars(owner_id, name, data)
    values(new.id, '个人事务台', jsonb_build_object('items','[]'::jsonb,'projects','[]'::jsonb,'colors','{}'::jsonb,'trash',jsonb_build_object('tasks','[]'::jsonb,'projects','[]'::jsonb),'workspaceName','个人事务台'))
    returning id into cid;
  insert into public.calendar_members(calendar_id,user_id,role) values(cid,new.id,'owner');
  return new;
end $$;

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
  if (lower(p_username)='re_chan') <> (invite_kind='admin') then
    raise exception 'Admin name requires its own invitation';
  end if;
  insert into public.personal_deadline_members(user_id,username,is_admin)
  values(p_user,p_username,invite_kind='admin');
  return true;
end $$;
