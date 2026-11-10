-- Storage for the Vercel deployment (api/index.js). Run once in your Supabase SQL editor,
-- then insert the SHA-256 of your BAROPS_STORE_SECRET:
--   insert into barops_private.config (id, secret_hash)
--   values (1, encode(extensions.digest('<your secret>', 'sha256'), 'hex'));
create schema if not exists barops_private;
revoke all on schema barops_private from public, anon, authenticated;
create table barops_private.state (id int primary key default 1 check (id = 1), data jsonb, version bigint not null default 0, updated_at timestamptz not null default now());
create table barops_private.config (id int primary key default 1 check (id = 1), secret_hash text not null);
insert into barops_private.state (id, data, version) values (1, null, 0);

create or replace function public.barops_load(p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if not exists (select 1 from barops_private.config c where c.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  select data, version into s from barops_private.state where id = 1;
  return jsonb_build_object('data', s.data, 'version', s.version);
end $$;

create or replace function public.barops_save(p_secret text, p_data jsonb, p_expected bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if not exists (select 1 from barops_private.config c where c.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  update barops_private.state set data = p_data, version = version + 1, updated_at = now()
    where id = 1 and version = p_expected returning version into v;
  return coalesce(v, -1);
end $$;

revoke all on function public.barops_load(text) from public;
revoke all on function public.barops_save(text, jsonb, bigint) from public;
grant execute on function public.barops_load(text) to anon;
grant execute on function public.barops_save(text, jsonb, bigint) to anon;
