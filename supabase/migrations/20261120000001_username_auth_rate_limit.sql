-- Username-only auth rate limiting. Staged; not applied to production.
create table if not exists public.downtime_auth_attempts (
  login_key_hash text primary key,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.downtime_auth_attempts enable row level security;
revoke all on public.downtime_auth_attempts from anon, authenticated;
grant all on public.downtime_auth_attempts to service_role;

create or replace function public.downtime_auth_rate_limit(p_login_key_hash text, p_max_attempts integer default 5, p_window_seconds integer default 900)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.downtime_auth_attempts%rowtype;
begin
  if length(p_login_key_hash) <> 44 or p_max_attempts < 1 or p_max_attempts > 20 or p_window_seconds < 60 or p_window_seconds > 3600 then
    return false;
  end if;
  insert into public.downtime_auth_attempts(login_key_hash,window_started_at,attempt_count,updated_at)
  values(p_login_key_hash,v_now,0,v_now)
  on conflict(login_key_hash) do nothing;
  select * into v_row from public.downtime_auth_attempts where login_key_hash=p_login_key_hash for update;
  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return false;
  end if;
  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    update public.downtime_auth_attempts set window_started_at=v_now,attempt_count=1,blocked_until=null,updated_at=v_now where login_key_hash=p_login_key_hash;
    return true;
  end if;
  if v_row.attempt_count >= p_max_attempts then
    update public.downtime_auth_attempts set blocked_until=v_row.window_started_at + make_interval(secs => p_window_seconds),updated_at=v_now where login_key_hash=p_login_key_hash;
    return false;
  end if;
  update public.downtime_auth_attempts set attempt_count=attempt_count+1,updated_at=v_now where login_key_hash=p_login_key_hash;
  return true;
end;
$$;
revoke all on function public.downtime_auth_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.downtime_auth_rate_limit(text,integer,integer) to service_role;

create or replace function public.downtime_auth_rate_limit_reset(p_login_key_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(p_login_key_hash) <> 44 then return; end if;
  update public.downtime_auth_attempts
    set window_started_at=now(),attempt_count=0,blocked_until=null,updated_at=now()
    where login_key_hash=p_login_key_hash;
end;
$$;
revoke all on function public.downtime_auth_rate_limit_reset(text) from public, anon, authenticated;
grant execute on function public.downtime_auth_rate_limit_reset(text) to service_role;
