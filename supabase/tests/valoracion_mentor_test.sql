-- Pruebas de la valoración del mentor por las familias (D2): permisos, media y cálculo.
-- Todo ocurre dentro de una transacción que se deshace al final; no deja datos.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('M',gen_random_uuid()),('P',gen_random_uuid()),('S1',gen_random_uuid()),('S2',gen_random_uuid()),('S3',gen_random_uuid());
grant select on ids to authenticated, anon;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'M' then 'mentor' when 'P' then 'padre' else 'alumno' end), jsonb_build_object('full_name', k || ' Prueba') from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
create function pg_temp.expect(label text, got numeric, want numeric) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function pg_temp.expect_text(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Una evaluación de familia (trimestre 1) por alumno.
insert into kiru_evaluations (student_id, target, cycle, anchor_on, due_on, original_due_on, status)
select pg_temp.i(k), 'familia', 1, current_date - 90, current_date, current_date, 'abierta' from (values ('S1'),('S2'),('S3')) v(k);
create function pg_temp.ev(k text) returns uuid language sql stable as $$
  select id from kiru_evaluations where student_id = pg_temp.i(k) and target = 'familia' $$;

-- 1. Media de las preguntas contestadas ---------------------------------------------------------
insert into kiru_mentor_ratings (evaluation_id, student_id, mentor_id, puntualidad, comunicacion, efectividad, trato, profesionalidad)
values (pg_temp.ev('S1'), pg_temp.i('S1'), pg_temp.i('M'), 5, 4, null, 5, 4);
select pg_temp.expect('media sin contar «no lo sé»',
  (select average from kiru_mentor_ratings where evaluation_id = pg_temp.ev('S1')), 4.5);

-- 2. Una sola valoración por mentor y evaluación ---------------------------------------------------
do $$ begin
  insert into kiru_mentor_ratings (evaluation_id, student_id, mentor_id, puntualidad)
  values (pg_temp.ev('S1'), pg_temp.i('S1'), pg_temp.i('M'), 1);
  raise exception 'FAIL repetida: se permitió';
exception when unique_violation then raise notice 'ok  no se puede valorar dos veces (denied)';
end $$;
do $$ begin
  insert into kiru_mentor_ratings (evaluation_id, student_id, mentor_id, puntualidad)
  values (pg_temp.ev('S2'), pg_temp.i('S2'), pg_temp.i('M'), 6);
  raise exception 'FAIL fuera de escala: se permitió';
exception when check_violation then raise notice 'ok  solo de 1 a 5 (denied)';
end $$;

-- 3. Confidencial: ni familias ni mentores la leen directamente --------------------------------------
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.i('M'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select count(*) into n from public.kiru_mentor_ratings;
    raise exception 'FAIL el mentor pudo leer valoraciones';
  exception when insufficient_privilege then raise notice 'ok  el mentor no lee las valoraciones (denied)';
  end;
  reset role;
end $$;

-- 4. D2: pendiente con menos de 3 familias, calculado con 3 ---------------------------------------
update kiru_perf_settings set data_from = current_date - 30, official_from = current_date - 30;
select pg_temp.expect_text('D2 con 1 familia queda pendiente',
  kiru_private.perf_indicator_values_d2(pg_temp.i('M'), now() - interval '30 days', now() + interval '1 day', '{}'::jsonb) #>> '{D2,status}', 'pendiente');
insert into kiru_mentor_ratings (evaluation_id, student_id, mentor_id, puntualidad, comunicacion, efectividad, trato, profesionalidad)
values (pg_temp.ev('S2'), pg_temp.i('S2'), pg_temp.i('M'), 4, 4, 4, 4, 4),
       (pg_temp.ev('S3'), pg_temp.i('S3'), pg_temp.i('M'), 3, 3, 3, 3, 3);
-- Media de las tres: (4,5 + 4 + 3) / 3 = 3,83 → (3,83 − 1) × 25 = 70,8
select pg_temp.expect('D2 con 3 familias: media pasada a 0-100',
  (kiru_private.perf_indicator_values_d2(pg_temp.i('M'), now() - interval '30 days', now() + interval '1 day', '{}'::jsonb) #>> '{D2,value}')::numeric, 70.8);
select pg_temp.expect('D2 cuenta 3 familias',
  (kiru_private.perf_indicator_values_d2(pg_temp.i('M'), now() - interval '30 days', now() + interval '1 day', '{}'::jsonb) #>> '{D2,ok}')::numeric, 3);
select pg_temp.expect_text('perf_compute incluye D2',
  (select x #>> '{values,D2,status}' from jsonb_array_elements(kiru_private.perf_compute(now() - interval '30 days', now() + interval '1 day', (select rules from kiru_private.perf_current_rules()))) x
   where x ->> 'mentor_id' = pg_temp.i('M')::text), 'calculado');

-- 5. Antes de la entrada en vigor no cuenta nada ------------------------------------------------------
update kiru_perf_settings set data_from = current_date + 1, official_from = current_date + 1;
select pg_temp.expect('D2 ignora valoraciones anteriores a la entrada en vigor',
  (kiru_private.perf_indicator_values_d2(pg_temp.i('M'), now() - interval '30 days', now() + interval '1 day', '{}'::jsonb) #>> '{D2,ok}')::numeric, 0);

rollback;
