-- Pruebas del desempeño de mentores (Fase 1): quién ve qué, reglas que no se pueden
-- editar, la regla de restas y topes, la nota por dimensiones con la cobertura mínima,
-- el cálculo de B1, B3, B4, E1 y E2 con datos de ejemplo y el recálculo guardado.
-- Todo ocurre dentro de una transacción que se deshace al final; no deja datos.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('M2',gen_random_uuid()),('C',gen_random_uuid()),
  ('P',gen_random_uuid()),('S1',gen_random_uuid());
grant select on ids to authenticated, service_role;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'A' then 'admin' when 'M' then 'mentor' when 'M2' then 'mentor' when 'C' then 'coordinador' when 'P' then 'padre'
  else 'alumno' end), jsonb_build_object('full_name', k || ' Prueba') from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
insert into student_mentors values (pg_temp.i('S1'),pg_temp.i('M'));
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
create function pg_temp.as_system() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
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
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Reglas aprobadas: no se editan ni se borran ------------------------------------------
select pg_temp.expect('hay una versión 1 aprobada', (select count(*) from kiru_perf_rule_versions where version = 1 and status = 'aprobada'), 1);
select pg_temp.expect('los pesos de las dimensiones suman 100',
  (select sum(value::numeric) from kiru_perf_rule_versions, jsonb_each_text(rules -> 'dimensions') where version = 1), 100);
select pg_temp.expect('los pesos internos de cada dimensión suman 100',
  (select count(*) from (select left(key,1) d, sum(value::numeric) s from kiru_perf_rule_versions, jsonb_each_text(rules -> 'indicators')
   where version = 1 group by 1) x where s = 100), 5);
select pg_temp.expect('cada peso interno tiene su ficha en el catálogo',
  (select count(*) from kiru_perf_rule_versions, jsonb_object_keys(rules -> 'indicators') k where version = 1
   and not exists (select 1 from kiru_perf_indicators i where i.code = k)), 0);
select pg_temp.expect_denied('una versión aprobada no se edita', $$update kiru_perf_rule_versions set rules = '{}' where version = 1$$);
select pg_temp.expect_denied('una versión aprobada no se borra', $$delete from kiru_perf_rule_versions where version = 1$$);

-- 2. Regla de restas y topes (aprobada el 13/11) -------------------------------------------
create function pg_temp.fin(perf numeric, l int, g int, mg int) returns numeric language sql as $$
  select (kiru_private.perf_final(perf, l, g, mg, (select rules from kiru_perf_rule_versions where version = 1)) ->> 'final')::numeric $$;
select pg_temp.expect('80 con una leve = 77', pg_temp.fin(80, 1, 0, 0), 77);
select pg_temp.expect('80 con una grave = 70 (el tope de 74 no actúa)', pg_temp.fin(80, 0, 1, 0), 70);
select pg_temp.expect('95 con una grave = 74 (actúa el tope)', pg_temp.fin(95, 0, 1, 0), 74);
select pg_temp.expect('95 con una muy grave = 59', pg_temp.fin(95, 0, 0, 1), 59);
select pg_temp.expect('60 con una muy grave = 40', pg_temp.fin(60, 0, 0, 1), 40);
select pg_temp.expect('95 con una leve sigue Excelente (92)', pg_temp.fin(95, 1, 0, 0), 92);
select pg_temp.expect('las leves restan como mucho 15 (95 con 7 leves = 80)', pg_temp.fin(95, 7, 0, 0), 80);
select pg_temp.expect('nunca baja de 0', pg_temp.fin(15, 0, 0, 1), 0);
-- Todos los casos de restas y topes (revisión final).
select pg_temp.expect('sin incidencias no cambia (88 = 88)', pg_temp.fin(88, 0, 0, 0), 88);
select pg_temp.expect('5 leves restan justo 15 (95 → 80)', pg_temp.fin(95, 5, 0, 0), 80);
select pg_temp.expect('6 leves siguen restando 15 (95 → 80)', pg_temp.fin(95, 6, 0, 0), 80);
select pg_temp.expect('2 graves: 95 − 20 = 75, tope 74', pg_temp.fin(95, 0, 2, 0), 74);
select pg_temp.expect('2 graves: 80 − 20 = 60', pg_temp.fin(80, 0, 2, 0), 60);
select pg_temp.expect('leve + grave: 95 − 13 = 82, tope 74', pg_temp.fin(95, 1, 1, 0), 74);
select pg_temp.expect('leve + grave: 70 − 13 = 57', pg_temp.fin(70, 1, 1, 0), 57);
select pg_temp.expect('7 leves + grave: 95 − 15 − 10 = 70', pg_temp.fin(95, 7, 1, 0), 70);
select pg_temp.expect('grave + muy grave: 95 − 30 = 65, tope 59', pg_temp.fin(95, 0, 1, 1), 59);
select pg_temp.expect('grave + muy grave: 70 − 30 = 40', pg_temp.fin(70, 0, 1, 1), 40);
select pg_temp.expect('2 muy graves: 95 − 40 = 55', pg_temp.fin(95, 0, 0, 2), 55);
select pg_temp.expect('muy grave en el límite: 79 − 20 = 59', pg_temp.fin(79, 0, 0, 1), 59);
select pg_temp.expect('grave en el límite: 84 − 10 = 74', pg_temp.fin(84, 0, 1, 0), 74);
select pg_temp.expect('leves también tocan suelo (10 con 5 leves = 0)', pg_temp.fin(10, 5, 0, 0), 0);
select pg_temp.expect('100 con una leve = 97', pg_temp.fin(100, 1, 0, 0), 97);
select pg_temp.expect('las restas se guardan: 7 leves + grave = 25',
  (kiru_private.perf_final(95, 7, 1, 0, (select rules from kiru_perf_rule_versions where version = 1)) ->> 'deductions')::numeric, 25);
select pg_temp.expect('con grave y muy grave manda el tope de 59',
  (kiru_private.perf_final(95, 0, 1, 1, (select rules from kiru_perf_rule_versions where version = 1)) ->> 'cap')::numeric, 59);
select pg_temp.expect_text('sin incidencias no hay tope',
  kiru_private.perf_final(95, 2, 0, 0, (select rules from kiru_perf_rule_versions where version = 1)) ->> 'cap', null);
select pg_temp.expect_text('sin muy grave no hay revisión de continuidad',
  kiru_private.perf_final(30, 7, 3, 0, (select rules from kiru_perf_rule_versions where version = 1)) ->> 'continuity_review', 'false');
select pg_temp.expect_text('sin nota, la muy grave pide igualmente revisión de continuidad',
  kiru_private.perf_final(null, 0, 0, 1, (select rules from kiru_perf_rule_versions where version = 1)) ->> 'continuity_review', 'true');
select pg_temp.expect_text('sin nota no se inventa una final',
  kiru_private.perf_final(null, 1, 1, 1, (select rules from kiru_perf_rule_versions where version = 1)) ->> 'final', null);
create function pg_temp.cat(perf numeric) returns text language sql as $$
  select kiru_private.perf_final(perf, 0, 0, 0, (select rules from kiru_perf_rule_versions where version = 1)) ->> 'category' $$;
select pg_temp.expect_text('100 Excelente', pg_temp.cat(100), 'excelente');
select pg_temp.expect_text('90 Excelente', pg_temp.cat(90), 'excelente');
select pg_temp.expect_text('89,9 Bueno', pg_temp.cat(89.9), 'bueno');
select pg_temp.expect_text('75 Bueno', pg_temp.cat(75), 'bueno');
select pg_temp.expect_text('74,9 Mejorable', pg_temp.cat(74.9), 'mejorable');
select pg_temp.expect_text('60 Mejorable', pg_temp.cat(60), 'mejorable');
select pg_temp.expect_text('59,9 Deficiente', pg_temp.cat(59.9), 'deficiente');
select pg_temp.expect_text('40 Deficiente', pg_temp.cat(40), 'deficiente');
select pg_temp.expect_text('39,9 Muy deficiente', pg_temp.cat(39.9), 'muy_deficiente');
select pg_temp.expect_text('0 Muy deficiente', pg_temp.cat(0), 'muy_deficiente');
select pg_temp.expect_text('categoría de 87,5 = bueno',
  kiru_private.perf_final(87.5, 0, 0, 0, (select rules from kiru_perf_rule_versions where version = 1)) ->> 'category', 'bueno');
select pg_temp.expect_text('una muy grave pide revisión de continuidad',
  kiru_private.perf_final(95, 0, 0, 1, (select rules from kiru_perf_rule_versions where version = 1)) ->> 'continuity_review', 'true');

-- 3. Nota por dimensiones y cobertura: ejemplo del diseño ----------------------------------
create temp table ex(v jsonb);
insert into ex values ('{
  "A1":{"status":"calculado","value":100},"A2":{"status":"calculado","value":82},"A3":{"status":"pendiente"},"A4":{"status":"calculado","value":100},
  "B1":{"status":"calculado","value":100},"B3":{"status":"calculado","value":75},"B4":{"status":"calculado","value":100},
  "C1":{"status":"calculado","value":75},"C2":{"status":"calculado","value":75},"C3":{"status":"calculado","value":100},"C4":{"status":"calculado","value":75},
  "D1":{"status":"calculado","value":87.5},
  "E1":{"status":"calculado","value":80},"E2":{"status":"calculado","value":100},"E3":{"status":"calculado","value":100}}');
grant select on ex to authenticated;
create function pg_temp.asm(inc jsonb, sessions int) returns jsonb language sql as $$
  select kiru_private.perf_assemble((select v from ex), (select rules from kiru_perf_rule_versions where version = 1), inc, sessions) $$;
select pg_temp.expect('ejemplo: nota ponderada 90,5', (pg_temp.asm('{}', 10) ->> 'performance')::numeric, 90.5);
select pg_temp.expect('ejemplo: cobertura 77,5 %', (pg_temp.asm('{}', 10) ->> 'coverage')::numeric, 77.5);
select pg_temp.expect_text('ejemplo: se puede publicar', pg_temp.asm('{}', 10) ->> 'publishable', 'true');
select pg_temp.expect_text('ejemplo: D sin nota (llamadas solo 40 % de su peso)', pg_temp.asm('{}', 10) #>> '{dimensions,D,value}', null);
select pg_temp.expect('ejemplo con una leve: 87,5', (pg_temp.asm('{"leve":1}', 10) ->> 'final')::numeric, 87.5);
select pg_temp.expect_text('ejemplo con una leve: Bueno', pg_temp.asm('{"leve":1}', 10) ->> 'category', 'bueno');
select pg_temp.expect_text('con 3 clases no se publica', pg_temp.asm('{}', 3) ->> 'publishable', 'false');
select pg_temp.expect_text('solo B y E: no se publica y dice que falta A',
  (kiru_private.perf_assemble('{"B1":{"status":"calculado","value":100},"E1":{"status":"calculado","value":100}}',
    (select rules from kiru_perf_rule_versions where version = 1), '{}', 10) -> 'reasons') ->> 0, 'Falta la dimensión A');
select pg_temp.expect('lo pendiente no cuenta como cero (solo B1=100 → B vale 100)',
  (kiru_private.perf_assemble('{"B1":{"status":"calculado","value":100},"B3":{"status":"pendiente"},"B4":{"status":"no_aplica"}}',
    (select rules from kiru_perf_rule_versions where version = 1), '{}', 10) #>> '{dimensions,B,value}')::numeric, 100);

-- 4. Datos de ejemplo para M (hace 25 días en adelante) ----------------------------------------
create temp table t(base timestamptz);
insert into t values (date_trunc('day', now()) - interval '25 days' + interval '17 hours');
grant select on t to authenticated;
create function pg_temp.d(n int) returns timestamptz language sql stable as $$ select base + make_interval(days => n) from t $$;

-- Registros: 3 a tiempo, 1 tarde (al día siguiente por la noche, más de 24 h).
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers) values
  ('l0', pg_temp.d(0) + interval '2 hours', pg_temp.d(0)::date, 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]'),
  ('l1', pg_temp.d(1) + interval '2 hours', pg_temp.d(1)::date, 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]'),
  ('l2', pg_temp.d(2) + interval '2 hours', pg_temp.d(2)::date, 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]'),
  ('l3', pg_temp.d(3) + interval '30 hours', pg_temp.d(3)::date, 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]');

insert into kiru_class_sessions(id, student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery, session_log_id, delivered_by,
  cancel_cause, cancelled_at, recovery, source)
select gen_random_uuid(), pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.d(n), pg_temp.d(n), pg_temp.d(n) + interval '1 hour',
  'impartida', (select id from kiru_session_logs where source_key = 'l' || n), pg_temp.i('M'), null, null, 'ninguna', 'horario'
from generate_series(0, 3) n;
-- Cancelada por el mentor y nunca recuperada (cuenta en contra en B1).
insert into kiru_class_sessions(student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery, consumption, cancel_cause, cancelled_at, recovery)
values (pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.d(4), pg_temp.d(4), pg_temp.d(4) + interval '1 hour', 'no_impartida', 'conservada', 'mentor', pg_temp.d(4) - interval '1 day', 'sin_encaje');
-- Cancelada por el mentor y recuperada (a favor en B1), con propuesta de fechas a tiempo (B4).
insert into kiru_class_sessions(student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery, consumption, cancel_cause, cancelled_at, recovery)
values (pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.d(5), pg_temp.d(5), pg_temp.d(5) + interval '1 hour', 'no_impartida', 'conservada', 'mentor', pg_temp.d(5) - interval '2 days', 'realizada');
-- Cancelada por el mentor, recuperación sin propuesta pasados 3 días (fuera de plazo en B4; en curso en B1).
insert into kiru_class_sessions(student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery, consumption, cancel_cause, cancelled_at, recovery)
values (pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.d(6), pg_temp.d(6), pg_temp.d(6) + interval '1 hour', 'no_impartida', 'conservada', 'mentor', pg_temp.d(6) - interval '1 day', 'pendiente');
-- Cancelada por la familia (no cuenta) e histórica (no cuenta).
insert into kiru_class_sessions(student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery, consumption, cancel_cause, cancelled_at, recovery)
values (pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.d(7), pg_temp.d(7), pg_temp.d(7) + interval '1 hour', 'no_impartida', 'consumida', 'familia_menos_48h', pg_temp.d(7) - interval '1 day', 'ninguna');
insert into kiru_class_sessions(student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery, consumption, cancel_cause, cancelled_at, recovery, source)
values (pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.d(8), pg_temp.d(8), pg_temp.d(8) + interval '1 hour', 'no_impartida', 'no_aplica', 'historico_sin_clasificar', pg_temp.d(8), 'ninguna', 'historico');
-- Clase pasada sin registro (solo cuenta en E1, no en B1).
insert into kiru_class_sessions(student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery)
values (pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.d(9), pg_temp.d(9), pg_temp.d(9) + interval '1 hour', 'programada');

-- Cancelación del mentor marcada como no justificada (B3) y propuesta a tiempo de la recuperada (B4).
insert into kiru_class_requests(session_id, mentor_id, student_id, kind, requested_by, requester_role, hours_notice, late, status, incident)
select id, pg_temp.i('M'), pg_temp.i('S1'), 'cancelacion', pg_temp.i('M'), 'mentor', 24, true, 'aprobada', 'no_justificada'
from kiru_class_sessions where original_start = pg_temp.d(4);
insert into kiru_class_requests(session_id, mentor_id, student_id, kind, requested_by, requester_role, status, created_at)
select id, pg_temp.i('M'), pg_temp.i('S1'), 'propuesta_recuperacion', pg_temp.i('M'), 'mentor', 'elegida', cancelled_at + interval '1 day'
from kiru_class_sessions where original_start = pg_temp.d(5);

-- Formulario trimestral del mentor: uno a tiempo y otro vencido sin hacer (E2 = 50).
insert into kiru_evaluations(student_id, target, cycle, mentor_id, anchor_on, due_on, original_due_on, status, completed_at, late)
values (pg_temp.i('S1'), 'mentor', 0, pg_temp.i('M'), pg_temp.d(0)::date, pg_temp.d(1)::date, pg_temp.d(1)::date, 'completada', pg_temp.d(2), false),
       (pg_temp.i('S1'), 'mentor', 1, pg_temp.i('M'), pg_temp.d(5)::date, pg_temp.d(6)::date, pg_temp.d(6)::date, 'abierta', null, false);

-- Revisión final: casos que no deben mover los resultados de arriba.
-- a) Cancelación no justificada en una clase cuya recuperación sigue en curso: aún no resta en B3.
insert into kiru_class_requests(session_id, mentor_id, student_id, kind, requested_by, requester_role, hours_notice, late, status, incident)
select id, pg_temp.i('M'), pg_temp.i('S1'), 'cancelacion', pg_temp.i('M'), 'mentor', 12, true, 'aprobada', 'no_justificada'
from kiru_class_sessions where original_start = pg_temp.d(6);
-- b) Clase histórica impartida con registro tarde y registro suelto archivado tarde: no cuentan en E1.
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers, manual_status) values
  ('l8', pg_temp.d(10) + interval '5 days', pg_temp.d(10)::date, 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]', null),
  ('l9', pg_temp.d(11) + interval '5 days', pg_temp.d(11)::date, 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]', 'archivado'),
  ('l10', pg_temp.d(12) + interval '5 days', pg_temp.d(12)::date, 'Desconocido', 'S1', null, pg_temp.i('S1'), '[]', null);
insert into kiru_class_sessions(student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery, session_log_id, delivered_by, recovery, source)
values (pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.d(10), pg_temp.d(10), pg_temp.d(10) + interval '1 hour', 'impartida',
  (select id from kiru_session_logs where source_key = 'l8'), pg_temp.i('M'), 'ninguna', 'historico');
-- c) Cancelada por el mentor y recuperación programada por Coordinación en plazo, sin propuesta de fechas:
--    cuenta a tiempo en B4 (pasa a 2 de 4 = 50) y, como sigue en curso, no entra en B1.
insert into kiru_class_sessions(id, student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery, consumption, cancel_cause, cancelled_at, recovery)
values ('00000000-0000-4000-8000-000000000013', pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.d(13), pg_temp.d(13), pg_temp.d(13) + interval '1 hour', 'no_impartida', 'conservada', 'mentor', pg_temp.d(13) - interval '1 day', 'programada');
insert into kiru_class_sessions(student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery, consumption, recovers_session_id, source, created_at)
values (pg_temp.i('S1'), pg_temp.i('M'), 'recuperacion', pg_temp.d(30), pg_temp.d(30), pg_temp.d(30) + interval '1 hour', 'programada', 'no_aplica',
  '00000000-0000-4000-8000-000000000013', 'recuperacion', pg_temp.d(13) + interval '1 day');

-- 5. Permisos ------------------------------------------------------------------------------
select pg_temp.as_user('M');
select pg_temp.expect('el mentor no ve las reglas (fase 1: solo administración)', (select count(*) from kiru_perf_rule_versions), 0);
select pg_temp.expect('el mentor no ve los ajustes', (select count(*) from kiru_perf_settings), 0);
select pg_temp.expect_denied('el mentor no puede hacer un ensayo', $$select kiru_perf_preview(current_date - 30, current_date)$$);
select pg_temp.expect_denied('el mentor no puede recalcular', $$select kiru_perf_recompute()$$);
select pg_temp.expect_denied('el mentor no cambia los ajustes', $$select kiru_perf_update_settings('oficial', current_date, current_date)$$);
select pg_temp.expect_denied('el mentor no escribe valores', $$insert into kiru_perf_events(action) values ('x')$$);
select pg_temp.expect_denied('el mentor no ve el panel de administración', $$select kiru_perf_admin_overview()$$);
select pg_temp.as_user('C');
select pg_temp.expect('el coordinador tampoco ve nada en la fase 1', (select count(*) from kiru_perf_rule_versions), 0);
select pg_temp.expect_denied('el coordinador no puede hacer un ensayo', $$select kiru_perf_preview(current_date - 30, current_date)$$);
select pg_temp.as_user('P');
select pg_temp.expect('la familia no ve nada', (select count(*) from kiru_perf_indicators), 0);
select pg_temp.expect_denied('la familia no puede hacer un ensayo', $$select kiru_perf_preview(current_date - 30, current_date)$$);
select pg_temp.as_user('S1');
select pg_temp.expect('el alumno no ve nada', (select count(*) from kiru_perf_settings), 0);
reset role;
set local role anon;
select pg_temp.expect_denied('sin sesión no se ve nada (tablas)', $$select count(*) from kiru_perf_scores$$);
select pg_temp.expect_denied('sin sesión no se ve nada (panel)', $$select kiru_perf_admin_overview()$$);
select pg_temp.expect_denied('sin sesión no se ejecuta el cálculo interno', $$select kiru_private.perf_compute(now() - interval '30 days', now(), '{}')$$);
reset role;
select pg_temp.as_user('C');
select pg_temp.expect_denied('el coordinador no ejecuta el cálculo interno', $$select kiru_private.perf_compute(now() - interval '30 days', now(), '{}')$$);
select pg_temp.expect('el coordinador no ve resultados guardados', (select count(*) from kiru_perf_scores), 0);

-- 6. Ensayo de administración con los datos de ejemplo --------------------------------------
select pg_temp.as_user('A');
select pg_temp.expect('administración ve las reglas', (select count(*) from kiru_perf_rule_versions), 1);
create temp table pv as select m from jsonb_array_elements(kiru_perf_preview((now() - interval '26 days')::date, current_date) -> 'mentors') m
  where m ->> 'mentor_id' = pg_temp.i('M')::text;
select pg_temp.expect('B1: 5 dadas de 6 resueltas = 83,3', (select (m #>> '{values,B1,value}')::numeric from pv), 83.3);
select pg_temp.expect('B1: la recuperación en curso, la familia y lo histórico no cuentan', (select (m #>> '{values,B1,total}')::numeric from pv), 6);
select pg_temp.expect('B1: la clase sin registro no cuenta en B1', (select (m #>> '{values,B1,detail,sin_registro_todavia}')::numeric from pv), 1);
select pg_temp.expect('B3: 1 cancelación no justificada de 6 = 83,3', (select (m #>> '{values,B3,value}')::numeric from pv), 83.3);
select pg_temp.expect('B4: 2 de 4 recuperaciones a tiempo (una programada por Coordinación) = 50', (select (m #>> '{values,B4,value}')::numeric from pv), 50);
select pg_temp.expect('B3: la cancelación con recuperación en curso aún no resta', (select (m #>> '{values,B3,detail,no_justificados}')::numeric from pv), 1);
select pg_temp.expect('E1: 3 de 5 registros en 24 h = 60', (select (m #>> '{values,E1,value}')::numeric from pv), 60);
select pg_temp.expect('E1: la clase sin registro cuenta como fuera de plazo', (select (m #>> '{values,E1,detail,sin_registro}')::numeric from pv), 1);
select pg_temp.expect('E2: 1 de 2 obligaciones a tiempo = 50', (select (m #>> '{values,E2,value}')::numeric from pv), 50);
select pg_temp.expect_text('sin dimensión A todavía: no se publica', (select m #>> '{score,publishable}' from pv), 'false');
select pg_temp.expect_text('y la nota global queda vacía en vez de inventarse', (select m #>> '{score,final}' from pv), null);
select pg_temp.expect_text('M2 sin datos: B1 pendiente, nunca cero',
  (select m #>> '{values,B1,status}' from jsonb_array_elements(kiru_perf_preview((now() - interval '26 days')::date, current_date) -> 'mentors') m
   where m ->> 'mentor_id' = pg_temp.i('M2')::text), 'pendiente');
select pg_temp.expect_text('M2 sin obligaciones: E2 no aplica',
  (select m #>> '{values,E2,status}' from jsonb_array_elements(kiru_perf_preview((now() - interval '26 days')::date, current_date) -> 'mentors') m
   where m ->> 'mentor_id' = pg_temp.i('M2')::text), 'no_aplica');
select pg_temp.expect('un ensayo con fechas fuera del periodo no ve nada',
  (select (m #>> '{values,B1,total}')::numeric from jsonb_array_elements(kiru_perf_preview((now() - interval '200 days')::date, (now() - interval '100 days')::date) -> 'mentors') m
   where m ->> 'mentor_id' = pg_temp.i('M')::text), 0);
select pg_temp.expect_denied('el ensayo admite como mucho seis meses', $$select kiru_perf_preview(current_date - 400, current_date)$$);

-- 7. Recálculo guardado y entrada en vigor ------------------------------------------------------
select pg_temp.expect_text('antes de la entrada en vigor no se calcula nada', kiru_perf_recompute() ->> 'calculado', 'false');
select pg_temp.expect('nada guardado', (select count(*) from kiru_perf_values), 0);
-- Entrada en vigor ayer: solo cuentan los datos desde ayer (nada de lo anterior).
select kiru_perf_update_settings('oculto', current_date - 1, current_date + 30);
select pg_temp.expect_text('después sí se calcula', kiru_perf_recompute() ->> 'calculado', 'true');
select pg_temp.expect('los datos anteriores a la entrada en vigor no cuentan',
  (select total from kiru_perf_values where mentor_id = pg_temp.i('M') and indicator = 'B1'), 0);
select pg_temp.expect('se guarda la nota provisional de cada mentor', (select count(*) from kiru_perf_scores), 2);
select pg_temp.expect('el cambio de ajustes queda en el historial', (select count(*) from kiru_perf_events where action = 'ajustes'), 1);
select pg_temp.expect_denied('el historial no se borra', $$delete from kiru_perf_events$$);
select pg_temp.as_system();
select pg_temp.expect_denied('ni siquiera desde el sistema', $$delete from kiru_perf_events$$);
select pg_temp.expect_text('la tarea nocturna (sin usuario) puede recalcular', kiru_perf_recompute() ->> 'calculado', 'true');
select pg_temp.expect('recalcular no duplica filas', (select count(*) from kiru_perf_scores), 2);
select pg_temp.as_user('A');
select pg_temp.expect('el panel de administración trae los dos mentores', jsonb_array_length(kiru_perf_admin_overview() -> 'mentors'), 2);
select pg_temp.expect('y los 17 indicadores del catálogo', jsonb_array_length(kiru_perf_admin_overview() -> 'indicators'), 17);

-- 7b. Borrar un perfil no queda bloqueado por el historial ni por las reglas aprobadas ----------
select pg_temp.as_system();
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a2', 'a2@t', '{"kiru_role":"admin"}', '{"full_name":"A2 Prueba"}');
insert into kiru_perf_events(actor_id, action) values ('00000000-0000-4000-8000-0000000000a2', 'prueba');
insert into kiru_perf_rule_versions(version, status, rules, approved_at, approved_by, created_by)
  select 99, 'aprobada', rules, now(), '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a2' from kiru_perf_rule_versions where version = 1;
delete from public.profiles where id = '00000000-0000-4000-8000-0000000000a2';
select pg_temp.expect('se puede borrar el perfil: el historial se queda sin autor', (select count(*) from kiru_perf_events where action = 'prueba' and actor_id is null), 1);
select pg_temp.expect('y la versión aprobada sigue intacta', (select count(*) from kiru_perf_rule_versions where version = 99 and approved_by is null and status = 'aprobada'), 1);
select pg_temp.expect_denied('pero el historial sigue sin poder editarse', $$update kiru_perf_events set action = 'otra' where action = 'prueba'$$);
select pg_temp.expect_denied('ni las reglas aprobadas', $$update kiru_perf_rule_versions set rules = '{}' where version = 99$$);
select pg_temp.expect_denied('ni se puede poner otro autor en el historial', $$update kiru_perf_events set actor_id = (select id from ids where k = 'A') where action = 'prueba'$$);

-- 8. Pagos intactos --------------------------------------------------------------------------
select pg_temp.expect('el módulo no lee ni escribe pagos de mentores',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (p.proname like 'perf\_%' or p.proname like 'kiru\_perf\_%') and p.prosrc ~* 'payout|kiru_payments|extra_cents'), 0);

rollback;
