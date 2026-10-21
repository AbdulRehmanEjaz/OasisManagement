begin;
-- The PIN identifies its account; no client-selected role is accepted.
-- Keep the service-only function signature compatible with existing deployments.
create or replace function public.pin_login_gate(p_role text) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if p_role is distinct from 'login' then return false;end if;
 insert into pin_login_limits values('login',1,now()+interval '5 minutes')
 on conflict(role) do update set
 hits=case when pin_login_limits.expires_at<=now() then 1 else pin_login_limits.hits+1 end,
 expires_at=case when pin_login_limits.expires_at<=now() then now()+interval '5 minutes' else pin_login_limits.expires_at end
 returning hits into n;
 return n<=5;
end $$;
-- A successful login removes only its own attempt, never prior failures.
create function public.pin_login_succeeded() returns void language sql security definer set search_path=public as $$ update pin_login_limits set hits=greatest(0,hits-1) where role='login' $$;
revoke all on function pin_login_succeeded() from public,anon,authenticated;
grant execute on function pin_login_succeeded() to service_role;
create or replace function public.set_pin_credential(p_user uuid,p_hash text,p_fingerprint text,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$ begin if not exists(select 1 from profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Administrator required'; end if; insert into pin_credentials(user_id,pin_hash,fingerprint) values(p_user,p_hash,p_fingerprint) on conflict(user_id) do update set pin_hash=excluded.pin_hash,fingerprint=excluded.fingerprint,version=pin_credentials.version+1,updated_at=now();delete from pin_sessions where user_id=p_user;delete from pin_login_limits where role='login';insert into audit_logs(record_type,record_id,actor_id,action,change_summary) values('profiles',p_user,p_actor,'PIN_CHANGED','{}');end $$;

commit;
