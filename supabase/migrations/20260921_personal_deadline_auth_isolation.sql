-- Supabase Auth is shared with the club calendar. Its existing signup trigger
-- must not create club data for a personal deadline account.
-- Only the service-role registration endpoint can set app_metadata.
create or replace function public.handle_club_calendar_user()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
declare
  uname text;
  ukey text;
  cid uuid;
begin
  if new.raw_app_meta_data->>'personal_deadline_account' = 'true' then
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
