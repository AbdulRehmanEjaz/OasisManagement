begin;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('admin','viewer','supervisor'));
alter table public.profiles add column deleted_at timestamptz;
alter table public.waste_reports add column site text not null default '';
grant update(site) on public.waste_reports to authenticated;
create table public.pin_credentials(user_id uuid primary key references profiles(id) on delete cascade,pin_hash text not null,fingerprint text not null unique,version integer not null default 1,updated_at timestamptz not null default now());
create table public.pin_sessions(session_id uuid primary key,user_id uuid not null references profiles(id),credential_version integer not null,expires_at timestamptz not null default now()+interval '8 hours');
create index pin_session_user on pin_sessions(user_id);
create table public.pin_login_limits(role text primary key,hits integer not null,expires_at timestamptz not null);
alter table pin_credentials enable row level security;
alter table pin_sessions enable row level security;
alter table pin_login_limits enable row level security;
revoke all on pin_credentials,pin_sessions,pin_login_limits from anon,authenticated;
grant all on pin_credentials,pin_sessions,pin_login_limits to service_role;
create or replace function public.active_user() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles p join pin_credentials c on c.user_id=p.id join pin_sessions s on s.user_id=p.id and s.credential_version=c.version where p.id=auth.uid() and p.is_active and p.deleted_at is null and s.expires_at>now() and s.session_id::text=auth.jwt()->>'session_id') $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select active_user() and exists(select 1 from profiles where id=auth.uid() and role='admin') $$;
create function public.can_submit() returns boolean language sql stable security definer set search_path=public as $$ select active_user() and exists(select 1 from profiles where id=auth.uid() and role in ('admin','supervisor')) $$;
create function public.pin_login_gate(p_role text) returns boolean language plpgsql security definer set search_path=public as $$ declare n integer; begin if p_role not in ('admin','viewer','supervisor') then return false; end if; insert into pin_login_limits values(p_role,1,now()+interval '5 minutes') on conflict(role) do update set hits=case when pin_login_limits.expires_at<=now() then 1 else pin_login_limits.hits+1 end,expires_at=case when pin_login_limits.expires_at<=now() then now()+interval '5 minutes' else pin_login_limits.expires_at end returning hits into n;return n<=5;end $$;
create function public.set_pin_credential(p_user uuid,p_hash text,p_fingerprint text,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$ begin if not exists(select 1 from profiles where id=p_actor and role='admin' and is_active and deleted_at is null) then raise exception 'Administrator required'; end if; insert into pin_credentials(user_id,pin_hash,fingerprint) values(p_user,p_hash,p_fingerprint) on conflict(user_id) do update set pin_hash=excluded.pin_hash,fingerprint=excluded.fingerprint,version=pin_credentials.version+1,updated_at=now();delete from pin_sessions where user_id=p_user;delete from pin_login_limits where role=(select role from profiles where id=p_user);insert into audit_logs(record_type,record_id,actor_id,action,change_summary) values('profiles',p_user,p_actor,'PIN_CHANGED','{}');end $$;
revoke all on function pin_login_gate(text),set_pin_credential(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function pin_login_gate(text),set_pin_credential(uuid,text,text,uuid) to service_role;
drop policy waste_read on waste_reports;
create policy waste_read on waste_reports for select to authenticated using(is_admin());
drop policy inspection_read on facility_inspections;
create policy inspection_read on facility_inspections for select to authenticated using(is_admin());
drop policy facility_read on facilities;
create policy facility_read on facilities for select to authenticated using(is_admin());
drop policy delivery_read on delivery_attempts;
create policy delivery_read on delivery_attempts for select to authenticated using(is_admin());
create function public.facility_choices() returns jsonb language plpgsql stable security definer set search_path=public as $$ begin if not can_submit() then raise exception 'Submission access required';end if;return coalesce((select jsonb_agg(jsonb_build_object('id',id,'number',number,'name',name,'site',site) order by name) from facilities where archived_at is null and (assigned_supervisor=auth.uid() or is_admin())),'[]'::jsonb);end $$;
create function public.viewer_records(p_kind text,p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public as $$ declare result jsonb; page integer:=greatest(0,least(coalesce((p_filters->>'page')::integer,0),100000));size integer:=case when p_filters->>'map'='1' then 1000 when p_filters->>'all'='1' then 250 else 12 end; begin
 if not active_user() or not exists(select 1 from profiles where id=auth.uid() and role='viewer') then raise exception 'Viewer access required';end if;
 if p_kind not in ('waste','facilities','inspections') then raise exception 'Read access denied';end if;
 with records as (
 select jsonb_build_object('id',r.id,'number',r.number,'category',r.category,'site',r.site,'quantity',r.quantity,'unit',r.unit,'description',r.description,'latitude',r.latitude,'longitude',r.longitude,'gps_accuracy_meters',r.gps_accuracy_meters,'gps_captured_at',r.gps_captured_at,'location_confirmed',r.location_confirmed,'location_confirmed_at',r.location_confirmed_at,'created_at',r.created_at,'waste_report_photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'url',p.url)) from waste_report_photos p where p.report_id=r.id),'[]'::jsonb)) as d from waste_reports r where p_kind='waste'
 union all select jsonb_build_object('id',r.id,'number',r.number,'name',r.name,'site',r.site,'category',r.category,'description',r.description,'status',r.status,'latitude',r.latitude,'longitude',r.longitude,'created_at',r.created_at,'facility_photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'url',p.url)) from facility_photos p where p.facility_id=r.id),'[]'::jsonb)) from facilities r where p_kind='facilities' and r.archived_at is null
 union all select jsonb_build_object('id',r.id,'number',r.number,'facility_id',r.facility_id,'condition',r.condition,'inspection_date',r.inspection_date,'description',r.description,'latitude',r.latitude,'longitude',r.longitude,'gps_accuracy_meters',r.gps_accuracy_meters,'gps_captured_at',r.gps_captured_at,'location_confirmed',r.location_confirmed,'location_confirmed_at',r.location_confirmed_at,'created_at',r.created_at,'facilities',(select jsonb_build_object('number',f.number,'name',f.name,'site',f.site) from facilities f where f.id=r.facility_id),'facility_inspection_photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'url',p.url)) from facility_inspection_photos p where p.inspection_id=r.id),'[]'::jsonb)) from facility_inspections r where p_kind='inspections'
 ), filtered as (select d from records where (coalesce(p_filters->>'id','')='' or d->>'id'=p_filters->>'id') and (coalesce(p_filters->>'facility','')='' or d->>'facility_id'=p_filters->>'facility') and (coalesce(p_filters->>'search','')='' or (case when p_kind='facilities' then d->>'name' else d->>'number' end) ilike '%'||(p_filters->>'search')||'%') and (coalesce(p_filters->>'category','')='' or coalesce(d->>'category',d->>'condition')=p_filters->>'category') and (coalesce(p_filters->>'date','')='' or ((d->>'created_at')::timestamptz at time zone 'Asia/Riyadh')::date=(p_filters->>'date')::date)), paged as (select d from filtered order by case when p_filters->>'sort'='oldest' then d->>'created_at' end asc,d->>'created_at' desc limit size offset page*size)
 select jsonb_build_object('data',coalesce((select jsonb_agg(d) from paged),'[]'::jsonb),'count',(select count(*) from filtered),'page',page,'size',size) into result;return result;
end $$;
revoke all on function viewer_records(text,jsonb),facility_choices() from public,anon;
grant execute on function viewer_records(text,jsonb),facility_choices() to authenticated;
create or replace function public.submit_report(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare loc location_verifications; rid uuid; num text; v_kind text:=p->>'kind'; photos uuid[]; previous jsonb; threshold numeric;
begin
 if not can_submit() then raise exception 'Unauthorized'; end if;
 if v_kind not in ('waste','inspection') then raise exception 'Invalid module'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p->>'idempotency_key',0));
 if v_kind='waste' then select jsonb_build_object('id',id,'number',number,'created_at',created_at) into previous from waste_reports where idempotency_key=(p->>'idempotency_key')::uuid and supervisor_id=auth.uid(); else select jsonb_build_object('id',id,'number',number,'created_at',created_at) into previous from facility_inspections where idempotency_key=(p->>'idempotency_key')::uuid and supervisor_id=auth.uid(); end if;
 if previous is not null then return previous; end if;
 select * into loc from location_verifications where id=(p->>'location_id')::uuid and user_id=auth.uid() for update;
 select gps_accuracy_meters into threshold from app_settings where id=true;
 if loc.id is null or loc.used_at is not null or loc.viewed_at is null or loc.confirmed_at is null or loc.confirmed_at<loc.viewed_at or loc.captured_at<now()-interval '5 minutes' or loc.captured_at>now()+interval '10 seconds' or loc.accuracy>threshold then raise exception 'Capture and confirm a recent accurate GPS location'; end if;
 select array_agg(distinct value::uuid) into photos from jsonb_array_elements_text(p->'photo_ids');
 if coalesce(array_length(photos,1),0) not between 2 and 3 then raise exception 'Two or three distinct photographs required'; end if;
 perform id from photo_uploads where id=any(photos) and user_id=auth.uid() for update;
 if (select count(*) from photo_uploads where id=any(photos) and user_id=auth.uid() and used_at is null)<>array_length(photos,1) then raise exception 'Invalid or already used uploads'; end if;
 if v_kind='waste' then
 if length(trim(coalesce(p->>'site','')))=0 then raise exception 'Site is required';end if;
 if not exists(select 1 from options where kind='waste' and label=p->>'category' and is_active) or not exists(select 1 from options where kind='unit' and label=p->>'unit' and is_active) then raise exception 'Invalid waste type or unit'; end if;
 insert into waste_reports(supervisor_id,site,category,quantity,unit,description,latitude,longitude,gps_accuracy_meters,gps_captured_at,location_confirmed,location_confirmed_at,idempotency_key) values(auth.uid(),p->>'site',p->>'category',(p->>'quantity')::numeric,p->>'unit',p->>'description',loc.latitude,loc.longitude,loc.accuracy,loc.captured_at,true,loc.confirmed_at,(p->>'idempotency_key')::uuid) returning id,number into rid,num;
 insert into waste_report_photos(report_id,url) select rid,url from photo_uploads where id=any(photos);
 else
 if not exists(select 1 from facilities where id=(p->>'facility_id')::uuid and archived_at is null and (assigned_supervisor=auth.uid() or is_admin())) then raise exception 'Facility not authorized'; end if;
 if not exists(select 1 from options where kind='status' and label=p->>'condition' and is_active) then raise exception 'Invalid condition'; end if;
 if (p->>'inspection_date')::date > (now() at time zone 'Asia/Riyadh')::date then raise exception 'Inspection date cannot be in the future'; end if;
 insert into facility_inspections(facility_id,supervisor_id,condition,inspection_date,description,latitude,longitude,gps_accuracy_meters,gps_captured_at,location_confirmed,location_confirmed_at,idempotency_key) values((p->>'facility_id')::uuid,auth.uid(),p->>'condition',(p->>'inspection_date')::date,p->>'description',loc.latitude,loc.longitude,loc.accuracy,loc.captured_at,true,loc.confirmed_at,(p->>'idempotency_key')::uuid) returning id,number into rid,num;
 insert into facility_inspection_photos(inspection_id,url) select rid,url from photo_uploads where id=any(photos);
 end if;
 update location_verifications set used_at=now() where id=loc.id;
 update photo_uploads set used_at=now() where id=any(photos);
 insert into notifications(report_type,record_id,recipient_id,message) select v_kind,rid,id,num||' submitted by '||(select full_name from profiles where id=auth.uid()) from profiles where role='admin' and is_active;
 insert into delivery_attempts(record_type,record_id,recipient) values(v_kind,rid,'pending configuration');
 return jsonb_build_object('id',rid,'number',num,'created_at',now());
end $$;

commit;
