-- Pruebas de las llamadas semanales con familias: permisos, reglas de las tablas e indicador D1.
-- Todo ocurre dentro de una transacción que se deshace al final; no deja datos.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('M',gen_random_uuid()),('C',gen_random_uuid()),('P',gen_random_uuid()),('S1',gen_random_uuid()),('S2',gen_random_uuid());
grant select on ids to authenticated, anon;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'M' then 'mentor' when 'C' then 'coordinador' when 'P' then 'padre' else 'alumno' end), jsonb_build_object('full_name', k || ' Prueba') from ids;
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

select pg_temp.expect_text('ajustes: apagado por defecto', (select value ->> 'modo' from kiru_settings where key = 'llamadas'), 'apagado');

-- 1. Plan: hora fija obligatoria si está confirmada -----------------------------------------------
do $$ begin
  insert into kiru_call_plans (student_id, status) values (pg_temp.i('S1'), 'confirmada');
  raise exception 'FAIL confirmada sin hora: se permitió';
exception when check_violation then raise notice 'ok  confirmada sin hora (denied)';
end $$;
insert into kiru_call_plans (student_id, status, weekday, start_time, mentor_id, coordinator_id)
values (pg_temp.i('S1'), 'confirmada', 2, '20:00', pg_temp.i('M'), pg_temp.i('C'));
select pg_temp.expect('plan con código propio', (select count(*) from kiru_call_plans where token is not null), 1);

-- 2. Llamadas: mentor solo en semanas 1 y 4; una por semana -----------------------------------------
do $$ begin
  insert into kiru_family_calls (student_id, week_start, week_no, with_mentor, scheduled_start)
  values (pg_temp.i('S1'), current_date, 2, true, now());
  raise exception 'FAIL mentor en semana 2: se permitió';
exception when check_violation then raise notice 'ok  mentor solo en semanas 1 y 4 (denied)';
end $$;
insert into kiru_family_calls (student_id, week_start, week_no, with_mentor, mentor_id, coordinator_id, scheduled_start, status, mentor_presence,
  preparacion, participacion, comunicacion, seguimiento, actitud)
values (pg_temp.i('S1'), current_date - 21, 1, true, pg_temp.i('M'), pg_temp.i('C'), now() - interval '21 days', 'hecha', 'estuvo', 5, 4, 4, 5, 4),
       (pg_temp.i('S2'), current_date - 21, 4, true, pg_temp.i('M'), pg_temp.i('C'), now() - interval '20 days', 'hecha', 'ausente', null, null, null, null, null),
       (pg_temp.i('S2'), current_date - 14, 1, true, pg_temp.i('M'), pg_temp.i('C'), now() - interval '13 days', 'hecha', 'causa_ajena', null, null, null, null, null),
       (pg_temp.i('S1'), current_date - 14, 2, false, null, pg_temp.i('C'), now() - interval '14 days', 'hecha', null, null, null, null, null, null);
select pg_temp.expect('media de la valoración', (select rating_average from kiru_family_calls where student_id = pg_temp.i('S1') and week_no = 1), 4.4);
do $$ begin
  insert into kiru_family_calls (student_id, week_start, week_no, with_mentor, scheduled_start)
  values (pg_temp.i('S1'), current_date - 21, 2, false, now());
  raise exception 'FAIL dos llamadas la misma semana: se permitió';
exception when unique_violation then raise notice 'ok  una llamada por semana (denied)';
end $$;

-- El sistema de desempeño cuenta desde 2027 por defecto: para la prueba, desde hace 100 días.
update kiru_perf_settings set data_from = current_date - 100;
-- 3. Indicador D1: la ausencia sin avisar cuenta como 1; la causa ajena no cuenta ----------------
-- (4.4 + 1) / 2 = 2.7 → (2.7 - 1) * 25 = 42.5
select pg_temp.expect('D1 valor', (kiru_private.perf_indicator_values_d1(pg_temp.i('M'), now() - interval '60 days', now() + interval '1 day', '{}'::jsonb) #>> '{D1,value}')::numeric, 42.5);
select pg_temp.expect('D1 llamadas contadas', (kiru_private.perf_indicator_values_d1(pg_temp.i('M'), now() - interval '60 days', now() + interval '1 day', '{}'::jsonb) #>> '{D1,total}')::numeric, 2);
select pg_temp.expect_text('D1 sin llamadas: pendiente',
  kiru_private.perf_indicator_values_d1(pg_temp.i('C'), now() - interval '60 days', now() + interval '1 day', '{}'::jsonb) #>> '{D1,status}', 'pendiente');
select pg_temp.expect('D1 entra en el cálculo', (select count(*) from jsonb_array_elements(kiru_private.perf_compute(now() - interval '60 days', now() + interval '1 day',
  (select rules from kiru_perf_rule_versions where version = 1))) e where e -> 'values' ? 'D1' and e ->> 'mentor_id' = pg_temp.i('M')::text), 1);

-- 4. Nadie lee las tablas desde el navegador (solo el servidor) ------------------------------------
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.i('P'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform 1 from kiru_family_calls limit 1;
  raise exception 'FAIL familia lee llamadas: se permitió';
exception when insufficient_privilege then raise notice 'ok  sin acceso directo a las llamadas (denied)';
end $$;
reset role;

-- 5. Aviso nuevo permitido ------------------------------------------------------------------------
insert into kiru_notifications (recipient_id, student_id, kind, title, event_key, email_status)
values (pg_temp.i('C'), pg_temp.i('S1'), 'llamada_familia', 'Prueba', 'llamada:prueba', 'pendiente');
select pg_temp.expect('aviso llamada_familia', (select count(*) from kiru_notifications where kind = 'llamada_familia'), 1);
rollback;
