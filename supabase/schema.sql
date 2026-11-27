-- Rupa v0.1: server-only prototype persistence + Supabase Auth + private Storage.
-- Run in YOUR OWN empty Supabase project. Never paste secret keys into client code.
-- Transaction aggregates are intentionally in a private-to-clients JSONB workspace
-- for this first prototype. A normalized per-tenant schema remains a production task.
create table if not exists public.rupa_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'customer' check (role in ('customer','merchant','tailor','admin')),
  shop_id text
);
alter table public.rupa_profiles enable row level security;
revoke all on public.rupa_profiles from anon, authenticated;
grant select, insert, update, delete on public.rupa_profiles to service_role;

create table if not exists public.rupa_workspace (
  id integer primary key check (id=1),
  revision bigint not null default 0,
  state jsonb not null
);
alter table public.rupa_workspace enable row level security;
revoke all on public.rupa_workspace from anon, authenticated;
grant select, insert, update on public.rupa_workspace to service_role;

create table if not exists public.rupa_rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
alter table public.rupa_rate_limits enable row level security;
revoke all on public.rupa_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.rupa_rate_limits to service_role;

-- SECURITY INVOKER: only the server's service_role may call this operation.
create or replace function public.rupa_check_limit(p_key text,p_max integer,p_window_ms integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_count integer;
begin
  if p_max<1 or p_window_ms<1 then return false; end if;
  insert into public.rupa_rate_limits(key,count,reset_at)
  values(p_key,1,now()+p_window_ms*interval '1 millisecond')
  on conflict(key) do update set
    count=case when rupa_rate_limits.reset_at<now() then 1 else rupa_rate_limits.count+1 end,
    reset_at=case when rupa_rate_limits.reset_at<now() then now()+p_window_ms*interval '1 millisecond' else rupa_rate_limits.reset_at end
  returning count into current_count;
  return current_count<=p_max;
end $$;
revoke all on function public.rupa_check_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.rupa_check_limit(text,integer,integer) to service_role;

-- This invoker trigger runs on Auth's trusted server insert. User metadata can
-- supply a DISPLAY NAME only; it can never supply role or shop membership.
create or replace function public.rupa_new_user()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.rupa_profiles(id,name,role)
 values(new.id,left(coalesce(new.raw_user_meta_data->>'name','Pelanggan'),80),'customer');
 return new;
end $$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.rupa_new_user() to supabase_auth_admin;
grant insert on public.rupa_profiles to supabase_auth_admin;
create policy "Auth creates customer profiles" on public.rupa_profiles for insert to supabase_auth_admin with check (role='customer' and shop_id is null);
revoke all on function public.rupa_new_user() from public,anon,authenticated;
drop trigger if exists rupa_create_profile on auth.users;
create trigger rupa_create_profile after insert on auth.users for each row execute function public.rupa_new_user();

-- Public clients receive NO Storage policies. The authenticated backend verifies
-- ownership, merchant proof access, or tailor assignment before proxying files.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rupa-private','rupa-private',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

-- Provision privileged profiles explicitly as project owner AFTER their account
-- registers. Use a verified auth user ID; never a browser-selected role.
-- update public.rupa_profiles set role='admin' where id='<verified-user-uuid>';
-- update public.rupa_profiles set role='merchant',shop_id='senja' where id='<uuid>';
-- update public.rupa_profiles set role='tailor' where id='<uuid>';
