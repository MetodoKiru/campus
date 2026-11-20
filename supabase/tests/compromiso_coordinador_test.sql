-- Pruebas del compromiso con la guía del coordinador. Todo se deshace al final.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('C',gen_random_uuid()),('C2',gen_random_uuid());
grant select on ids to authenticated, anon;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'A' then 'admin' when 'M' then 'mentor' else 'coordinador' end), jsonb_build_object('full_name', k || ' Prueba') from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
create function pg_temp.as_user(k text) returns void language plpgsql as $$
declare u uuid;
begin
  reset role;
  u := pg_temp.i(k);
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','app_metadata',
    json_build_object('kiru_role',(select raw_app_meta_data->>'kiru_role' from auth.users where id=u)))::text, true);
  set local role authenticated;
end $$;
create function pg_temp.expect(label text, got numeric, want numeric) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function pg_temp.expect_denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when insufficient_privilege or check_violation or raise_exception or invalid_parameter_value then
    raise notice 'ok  % (denied)', label; return;
  end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

select pg_temp.as_user('C');
select pg_temp.expect('al principio no ha aceptado', (select count(*) from kiru_role_commitments), 0);
select pg_temp.expect('el coordinador acepta', (select (kiru_commitment_accept('guia_coordinador', 1) is not null)::int), 1);
select pg_temp.expect('aceptar dos veces no duplica', (select (kiru_commitment_accept('guia_coordinador', 1) is not null)::int + (select count(*) from kiru_role_commitments)::int), 2);
select pg_temp.expect_denied('no puede escribir directamente', $$insert into kiru_role_commitments(user_id, document, version) values (pg_temp.i('C'), 'guia_coordinador', 2)$$);
select pg_temp.expect_denied('documento desconocido', $$select kiru_commitment_accept('otro', 1)$$);
select pg_temp.as_user('C2');
select pg_temp.expect('otro coordinador no ve el compromiso ajeno', (select count(*) from kiru_role_commitments), 0);
select pg_temp.as_user('M');
select pg_temp.expect_denied('un mentor no puede aceptar la guía', $$select kiru_commitment_accept('guia_coordinador', 1)$$);
select pg_temp.as_user('A');
select pg_temp.expect('Administración ve quién la aceptó', (select count(*) from kiru_role_commitments where user_id = pg_temp.i('C')), 1);
rollback;
