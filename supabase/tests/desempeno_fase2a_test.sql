-- Pruebas de la Fase 2a del desempeño: plan del alumno (A4), ficha de Cálculalo (A3) y
-- errores en el registro (E3): quién puede hacer qué, validaciones y cálculo.
-- Todo ocurre dentro de una transacción que se deshace al final; no deja datos.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('M2',gen_random_uuid()),('C',gen_random_uuid()),
  ('P',gen_random_uuid()),('S1',gen_random_uuid()),('S2',gen_random_uuid());
grant select on ids to authenticated, anon;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'A' then 'admin' when 'M' then 'mentor' when 'M2' then 'mentor' when 'C' then 'coordinador' when 'P' then 'padre'
  else 'alumno' end), jsonb_build_object('full_name', k || ' Prueba') from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
insert into student_mentors(student_id, mentor_id, assigned_at) values
  (pg_temp.i('S1'), pg_temp.i('M'), now() - interval '120 days'), (pg_temp.i('S2'), pg_temp.i('M2'), now() - interval '120 days');
insert into student_guardians(student_id, guardian_id) values (pg_temp.i('S1'), pg_temp.i('P'));
insert into kiru_coordinator_mentors(mentor_id,coordinator_id) values (pg_temp.i('M'),pg_temp.i('C'));

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
create function pg_temp.expect_text(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function pg_temp.expect_denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when insufficient_privilege or check_violation or raise_exception then
    raise notice 'ok  % (denied)', label; return;
  end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;
create temp table t(today date, last_month date, prev_month date);
insert into t select (now() at time zone 'Europe/Madrid')::date,
  (date_trunc('month', now() at time zone 'Europe/Madrid') - interval '1 month')::date,
  (date_trunc('month', now() at time zone 'Europe/Madrid') - interval '2 months')::date;
grant select on t to authenticated, anon;
-- Lunes que tocan un mes, como los envía la pantalla.
create function pg_temp.mondays(m date) returns setof date language sql stable as $$
  select g::date from generate_series(date_trunc('week', m)::timestamp, (m + interval '1 month' - interval '1 day')::timestamp, interval '7 days') g $$;

-- 0. Plazo de 2 días laborables ------------------------------------------------------------
select pg_temp.expect_text('viernes + 2 laborables = martes a las 23:59',
  to_char(kiru_private.add_working_days('2026-11-13 10:00+01', 2) at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI'), '2026-11-17 23:59');
select pg_temp.expect_text('lunes + 2 laborables = miércoles',
  to_char(kiru_private.add_working_days('2026-11-16 10:00+01', 2) at time zone 'Europe/Madrid', 'YYYY-MM-DD'), '2026-11-18');

-- 1. Plan del alumno -----------------------------------------------------------------------
select pg_temp.as_user('C');
select kiru_set_student_tool(pg_temp.i('S1'), 'ingles', true);
select kiru_set_student_tool(pg_temp.i('S1'), 'ingles', true);
select pg_temp.expect('el coordinador marca inglés obligatorio (una sola vez)', (select count(*) from kiru_student_plan_tools where student_id = pg_temp.i('S1')), 1);
select kiru_set_student_tool(pg_temp.i('S1'), 'lengua', true);
select kiru_set_student_tool(pg_temp.i('S1'), 'lengua', false);
select pg_temp.expect('quitar lengua la cierra sin borrarla', (select count(*) from kiru_student_plan_tools where tool = 'lengua' and active_to is not null), 1);
select pg_temp.expect_denied('no puede tocar alumnos de otros mentores', $$select kiru_set_student_tool(pg_temp.i('S2'), 'ingles', true)$$);
select pg_temp.expect_denied('herramienta desconocida', $$select kiru_set_student_tool(pg_temp.i('S1'), 'calculalo', true)$$);
select pg_temp.expect_denied('nadie escribe directamente', $$insert into kiru_student_plan_tools(student_id, tool, active_from) values (pg_temp.i('S1'), 'tarjetas', current_date)$$);
select pg_temp.as_user('M');
select pg_temp.expect('el mentor ve qué es obligatorio para su alumno', (select count(*) from kiru_student_plan_tools where active_to is null), 1);
select pg_temp.expect_denied('el mentor no cambia el plan', $$select kiru_set_student_tool(pg_temp.i('S1'), 'tarjetas', true)$$);
select pg_temp.as_user('M2');
select pg_temp.expect('otro mentor no lo ve', (select count(*) from kiru_student_plan_tools), 0);
select pg_temp.as_user('P');
select pg_temp.expect('la familia no lo ve', (select count(*) from kiru_student_plan_tools), 0);

-- 2. Ficha de Cálculalo ----------------------------------------------------------------------
select pg_temp.as_user('C');
select kiru_save_calculalo_check(pg_temp.i('S1'), (select last_month from t),
  (select jsonb_agg(jsonb_build_object('week', d, 'ok', n <= 3)) from (select d, row_number() over (order by d) n from pg_temp.mondays((select last_month from t)) d) x),
  true, 4, 'Bien');
select kiru_save_calculalo_check(pg_temp.i('S1'), (select last_month from t),
  (select jsonb_agg(jsonb_build_object('week', d, 'ok', n <= 3)) from (select d, row_number() over (order by d) n from pg_temp.mondays((select last_month from t)) d) x),
  true, null, '');
select pg_temp.expect('guardar dos veces el mismo mes no duplica', (select count(*) from kiru_calculalo_checks), 1);
select pg_temp.expect('cuenta 3 semanas con 4 días o más', (select weeks_ok from kiru_calculalo_checks), 3);
select pg_temp.expect('y todas las semanas del mes', (select weeks_due from kiru_calculalo_checks), (select count(*) from pg_temp.mondays((select last_month from t))));
select pg_temp.expect_denied('una semana que no empieza en lunes', $$select kiru_save_calculalo_check(pg_temp.i('S1'), (select last_month from t), jsonb_build_array(jsonb_build_object('week', (select max(d) + 1 from pg_temp.mondays((select last_month from t)) d), 'ok', true)), true)$$);
select pg_temp.expect_denied('un mes que no ha empezado', $$select kiru_save_calculalo_check(pg_temp.i('S1'), (select today from t) + 40, '[]', true)$$);
select pg_temp.expect_denied('sin decir si preparó actividades', $$select kiru_save_calculalo_check(pg_temp.i('S1'), (select last_month from t), '[]', null)$$);
select pg_temp.expect_denied('calidad fuera de 1-5', $$select kiru_save_calculalo_check(pg_temp.i('S1'), (select last_month from t), '[]', true, 7)$$);
select pg_temp.expect_denied('alumno de otro coordinador', $$select kiru_save_calculalo_check(pg_temp.i('S2'), (select last_month from t), '[]', true)$$);
select pg_temp.as_user('M');
select pg_temp.expect_denied('el mentor no rellena su propia ficha', $$select kiru_save_calculalo_check(pg_temp.i('S1'), (select last_month from t), '[]', true)$$);
select pg_temp.expect('ni la ve', (select count(*) from kiru_calculalo_checks), 0);

-- 3. Errores en el registro --------------------------------------------------------------------
reset role;
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers)
select 'e' || n, now() - make_interval(days => 30 - n), (now() - make_interval(days => 30 - n))::date, 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]'
from generate_series(1, 6) n;
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers, manual_status)
values ('e-arch', now() - interval '20 days', (now() - interval '20 days')::date, 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]', 'archivado'),
       ('e-m2', now() - interval '20 days', (now() - interval '20 days')::date, 'M2', 'S2', pg_temp.i('M2'), pg_temp.i('S2'), '[]', null);
create function pg_temp.log(k text) returns uuid language sql stable as $$ select id from kiru_session_logs where source_key = k $$;

select pg_temp.as_user('C');
select kiru_log_error_mark(pg_temp.log('e1'), 'skillcoins', 'Las SkillCoins no cuadran con lo que cuentas.');
select pg_temp.expect_denied('un registro solo tiene un error vivo', $$select kiru_log_error_mark(pg_temp.log('e1'), 'otro', 'Otra cosa')$$);
select pg_temp.expect_denied('hay que explicar el error', $$select kiru_log_error_mark(pg_temp.log('e2'), 'otro', '  ')$$);
select pg_temp.expect_denied('tipo desconocido', $$select kiru_log_error_mark(pg_temp.log('e2'), 'tarde', 'x')$$);
select pg_temp.expect_denied('registros de mentores que no coordina', $$select kiru_log_error_mark(pg_temp.log('e-m2'), 'otro', 'x')$$);
reset role;
select pg_temp.expect('el mentor recibe aviso en la campanita y por correo',
  (select count(*) from kiru_notifications where recipient_id = pg_temp.i('M') and kind = 'registro_error' and email_status = 'pendiente'), 1);
select pg_temp.as_user('M2');
select pg_temp.expect('otro mentor no ve la marca', (select count(*) from kiru_log_error_marks), 0);
select pg_temp.expect_denied('ni puede contestarla', $$select kiru_log_error_reply((select id from kiru_log_error_marks limit 1), 'x')$$);
select pg_temp.as_user('M');
select pg_temp.expect('el mentor ve su marca', (select count(*) from kiru_log_error_marks), 1);
select pg_temp.expect_denied('respuesta vacía', $$select kiru_log_error_reply((select id from kiru_log_error_marks limit 1), '')$$);
select kiru_log_error_reply((select id from kiru_log_error_marks limit 1), 'Corregido en la hoja.');
select pg_temp.expect_text('queda respondida', (select status from kiru_log_error_marks), 'respondida');
select pg_temp.expect_denied('no se contesta dos veces', $$select kiru_log_error_reply((select id from kiru_log_error_marks limit 1), 'otra')$$);
select pg_temp.expect_denied('el mentor no retira marcas', $$select kiru_log_error_withdraw((select id from kiru_log_error_marks limit 1), 'no')$$);
reset role;
select pg_temp.expect('el coordinador recibe la respuesta',
  (select count(*) from kiru_notifications where recipient_id = pg_temp.i('C') and kind = 'registro_error_respuesta'), 1);
-- Casos de plazo: sin contestar y vencida, contestada tarde, aún en plazo, retirada.
insert into kiru_log_error_marks(session_log_id, mentor_id, student_id, kind, comment, marked_by, marked_at, due_at)
values (pg_temp.log('e2'), pg_temp.i('M'), pg_temp.i('S1'), 'otro', 'Sin contestar', pg_temp.i('C'), now() - interval '10 days', now() - interval '6 days'),
       (pg_temp.log('e4'), pg_temp.i('M'), pg_temp.i('S1'), 'otro', 'En plazo', pg_temp.i('C'), now(), now() + interval '2 days'),
       (pg_temp.log('e5'), pg_temp.i('M'), pg_temp.i('S1'), 'otro', 'Se retirará', pg_temp.i('C'), now() - interval '10 days', now() - interval '6 days');
insert into kiru_log_error_marks(session_log_id, mentor_id, student_id, kind, comment, marked_by, marked_at, due_at, status, reply, replied_at)
values (pg_temp.log('e3'), pg_temp.i('M'), pg_temp.i('S1'), 'otro', 'Contestada tarde', pg_temp.i('C'), now() - interval '10 days', now() - interval '6 days', 'respondida', 'tarde', now() - interval '2 days');
select pg_temp.as_user('C');
select pg_temp.expect_denied('retirar exige motivo', $$select kiru_log_error_withdraw((select id from kiru_log_error_marks where comment = 'Se retirará'), '')$$);
select kiru_log_error_withdraw((select id from kiru_log_error_marks where comment = 'Se retirará'), 'Era correcto.');
select pg_temp.as_user('P');
select pg_temp.expect('la familia no ve marcas', (select count(*) from kiru_log_error_marks), 0);

-- 4. A4: inglés obligatorio desde hace 45 días → 3 quincenas cerradas; tareas en la 1.ª y la 3.ª.
reset role;
update kiru_student_plan_tools set active_from = (select today from t) - 45 where tool = 'ingles';
insert into kiru_app_records(owner_id, record_type, record_key, data, created_by, created_at, updated_at) values
  (pg_temp.i('S1'), 'task', 't1', jsonb_build_object('kind', 'english_task', 'studentId', pg_temp.i('S1'), 'mentorId', pg_temp.i('M')), pg_temp.i('M'), now() - interval '40 days', now() - interval '40 days'),
  (pg_temp.i('S1'), 'task', 't2', jsonb_build_object('kind', 'english_task', 'studentId', pg_temp.i('S1'), 'mentorId', pg_temp.i('M')), pg_temp.i('M'), now() - interval '10 days', now() - interval '10 days'),
  (pg_temp.i('S1'), 'task', 't3', jsonb_build_object('kind', 'lengua_task', 'studentId', pg_temp.i('S1')), pg_temp.i('M'), now() - interval '25 days', now() - interval '25 days');
-- Ficha de hace dos meses: 2 de 4 semanas y sin actividades preparadas.
insert into kiru_calculalo_checks(student_id, mentor_id, month, weeks, weeks_due, weeks_ok, mentor_prepared)
values (pg_temp.i('S1'), pg_temp.i('M'), (select prev_month from t), '[]', 4, 2, false);

create temp table v as select kiru_private.perf_indicator_values_2a(pg_temp.i('M'), now() - interval '100 days', now() + interval '1 day',
  (select rules from kiru_perf_rule_versions where version = 1)) as x;
select pg_temp.expect('A4: 2 de 3 quincenas con inglés = 66,7', (select (x #>> '{A4,value}')::numeric from v), 66.7);
select pg_temp.expect('A4: la tarea de lengua no cuenta (lengua no es obligatoria)', (select (x #>> '{A4,detail,quincenas_lengua}')::numeric from v), 0);
select pg_temp.expect('A3: semanas y preparación de las dos fichas',
  (select (x #>> '{A3,value}')::numeric from v),
  (select round(50.0 * (2 + 3) / (4 + (select count(*) from pg_temp.mondays((select last_month from t)))) + 50.0 * 1 / 2, 1)));
select pg_temp.expect('E3: 3 de 5 registros (en plazo no cuenta, retirada no resta, archivado fuera)', (select (x #>> '{E3,value}')::numeric from v), 60);
select pg_temp.expect('E3: 1 en plazo de respuesta', (select (x #>> '{E3,detail,en_plazo_de_respuesta}')::numeric from v), 1);
create temp table v2 as select kiru_private.perf_indicator_values_2a(pg_temp.i('M2'), now() - interval '100 days', now() + interval '1 day',
  (select rules from kiru_perf_rule_versions where version = 1)) as x;
select pg_temp.expect_text('A4 no aplica sin herramientas obligatorias', (select x #>> '{A4,status}' from v2), 'no_aplica');
select pg_temp.expect_text('A3 pendiente sin fichas (nunca cero)', (select x #>> '{A3,status}' from v2), 'pendiente');
select pg_temp.expect_text('E3 pendiente con menos de 4 registros', (select x #>> '{E3,status}' from v2), 'pendiente');
create temp table v3 as select kiru_private.perf_indicator_values_2a(pg_temp.i('M'), now() - interval '5 days', now() + interval '1 day',
  (select rules from kiru_perf_rule_versions where version = 1)) as x;
select pg_temp.expect_text('fuera del periodo no cuenta nada de antes', (select x #>> '{A3,status}' from v3), 'pendiente');

-- 5. El ensayo de administración ya trae A3, A4 y E3 -----------------------------------------
select pg_temp.as_user('A');
select pg_temp.expect('el ensayo junta los indicadores de las fases 1, 2a y 2b',
  (select count(*) from jsonb_object_keys((select m -> 'values' from jsonb_array_elements(kiru_perf_preview((now() - interval '100 days')::date, current_date) -> 'mentors') m
   where m ->> 'mentor_id' = pg_temp.i('M')::text))), 10);
select pg_temp.as_user('C');
select pg_temp.expect_denied('el coordinador sigue sin ver puntuaciones', $$select kiru_perf_preview(current_date - 30, current_date)$$);

-- 6. Sin sesión, nada ----------------------------------------------------------------------
reset role;
set local role anon;
select pg_temp.expect_denied('sin sesión no se marca nada', $$select kiru_log_error_mark(pg_temp.log('e6'), 'otro', 'x')$$);
select pg_temp.expect_denied('sin sesión no se cambia el plan', $$select kiru_set_student_tool(pg_temp.i('S1'), 'ingles', true)$$);
reset role;
select pg_temp.expect('el módulo sigue sin leer ni escribir pagos',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (p.proname like 'perf\_%' or p.proname like 'kiru\_perf\_%' or p.proname in ('kiru_set_student_tool', 'kiru_save_calculalo_check', 'kiru_log_error_mark', 'kiru_log_error_reply', 'kiru_log_error_withdraw'))
     and p.prosrc ~* 'payout|kiru_payments|extra_cents'), 0);

rollback;
