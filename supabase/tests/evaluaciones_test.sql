-- Pruebas de las evaluaciones trimestrales: calendario de familia, mentor y papel,
-- recordatorios, cierre del plazo del mentor, modo prueba/apagado y que repetir
-- la tarea el mismo día no duplica nada. Todo se deshace al final.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('P',gen_random_uuid()),('P2',gen_random_uuid()),
  ('S1',gen_random_uuid()),('S2',gen_random_uuid()),('C',gen_random_uuid());
insert into auth.users(id,email,raw_app_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'A' then 'admin' when 'M' then 'mentor' when 'P' then 'padre' when 'P2' then 'padre'
  when 'C' then 'coordinador' else 'alumno' end) from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
insert into student_mentors(student_id, mentor_id, assigned_at) values
  (pg_temp.i('S1'),pg_temp.i('M'), '2026-01-01'), (pg_temp.i('S2'),pg_temp.i('M'), '2026-01-01');
insert into student_guardians(student_id,guardian_id) values (pg_temp.i('S1'),pg_temp.i('P')),(pg_temp.i('S2'),pg_temp.i('P2'));
insert into kiru_coordinator_mentors(mentor_id,coordinator_id) values (pg_temp.i('M'),pg_temp.i('C'));
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers) values
  ('ev-1', '2026-01-05 18:00+01', '2026-01-05', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]'),
  ('ev-2', '2026-01-05 18:00+01', '2026-01-05', 'M', 'S2', pg_temp.i('M'), pg_temp.i('S2'), '[]');

create function pg_temp.expect(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function pg_temp.expect_text(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function pg_temp.run(d date) returns jsonb language sql as $$ select public.kiru_evaluaciones_tarea_diaria(d) $$;
create function pg_temp.notes(k text, step text) returns bigint language sql stable as $$
  select count(*) from kiru_notifications where recipient_id = pg_temp.i(k) and kind = 'evaluacion_trimestral' and event_key like '%:' || step || ':%' $$;
create function pg_temp.ev(target text, cyc int) returns kiru_evaluations language sql stable as $$
  select * from kiru_evaluations where student_id = pg_temp.i('S1') and target = ev.target and cycle = cyc $$;

-- Apagado: no hace nada.
select pg_temp.expect_text('apagado no crea nada', pg_temp.run('2026-01-05')->>'creadas', '0');

-- Modo prueba con S1.
update kiru_settings set value = value || jsonb_build_object('modo', 'prueba', 'alumnos_prueba', jsonb_build_array(pg_temp.i('S1'))) where key = 'evaluaciones';
select pg_temp.run('2026-01-05');
select pg_temp.expect('la familia de S1 recibe la inicial el primer día', pg_temp.notes('P', 'abre'), 1);
select pg_temp.expect('S2 no está en la prueba', (select count(*) from kiru_evaluations where student_id = pg_temp.i('S2')), 0);
select pg_temp.expect_text('papel inicial abierto con plazo de 14 días', (select status || ' ' || due_on from pg_temp.ev('alumno', 0)), 'abierta 2026-01-19');
select pg_temp.expect('el mentor recibe el aviso de imprimir', pg_temp.notes('M', 'imprimir'), 1);
select pg_temp.expect('coordinación recibe el aviso de elegir la académica', pg_temp.notes('C', 'elegir'), 1);
select pg_temp.expect('el formulario del mentor aún no existe (4 semanas)', (select count(*) from kiru_evaluations where target = 'mentor'), 0);
select pg_temp.run('2026-01-05');
select pg_temp.expect('repetir el mismo día no duplica avisos', (select count(*) from kiru_notifications where kind = 'evaluacion_trimestral'), 5);

-- Recordatorios de la familia.
select pg_temp.run('2026-01-08');
select pg_temp.expect('día 3: sin recordatorio', pg_temp.notes('P', 'r1'), 0);
select pg_temp.run('2026-01-09');
select pg_temp.expect('día 4: primer recordatorio', pg_temp.notes('P', 'r1'), 1);
select pg_temp.run('2026-01-13');
select pg_temp.expect('día 8: segundo recordatorio', pg_temp.notes('P', 'r2'), 1);
select pg_temp.run('2026-01-15');
select pg_temp.expect('día 10: aviso al coordinador', pg_temp.notes('C', 'coord'), 1);
select pg_temp.run('2026-01-22');
select pg_temp.expect('papel sin escaneo a los 3 días: recordatorio al mentor', pg_temp.notes('M', 'r1'), 1);

-- Familia responde (lo hace la API al llegar la respuesta de Jotform).
update kiru_evaluations set status = 'completada', completed_at = now(), completed_via = 'formulario'
where id = (pg_temp.ev('familia', 0)).id;

-- Formulario del mentor: 4 semanas después de su primera clase (02/02), abierto del 31/01 al 04/02.
select pg_temp.run('2026-01-29');
select pg_temp.expect_text('el del mentor queda programado', (pg_temp.ev('mentor', 0)).status, 'programada');
select pg_temp.run('2026-01-31');
select pg_temp.expect_text('se abre 2 días antes', (pg_temp.ev('mentor', 0)).status, 'abierta');
select pg_temp.expect('el mentor recibe su aviso', pg_temp.notes('M', 'abre'), 1);
select pg_temp.run('2026-02-03');
select pg_temp.expect('recordatorio al mentor el día después', (select count(*) from kiru_notifications where recipient_id = pg_temp.i('M') and event_key like 'eval:' || (pg_temp.ev('mentor', 0)).id || ':r1:%'), 1);
select pg_temp.run('2026-02-05');
select pg_temp.expect_text('pasado el plazo queda sin respuesta', (pg_temp.ev('mentor', 0)).status, 'sin_respuesta');
select pg_temp.expect('coordinación sabe que el mentor no respondió', (select count(*) from kiru_notifications where recipient_id = pg_temp.i('C') and event_key like 'eval:' || (pg_temp.ev('mentor', 0)).id || ':coord:%'), 1);

-- Primer trimestre: familia 05/04; papel 27/04 (5 días antes del formulario del mentor, 02/05).
select pg_temp.run('2026-03-20');
select pg_temp.expect_text('la trimestral de la familia se programa con antelación', (pg_temp.ev('familia', 1)).due_on::text, '2026-04-05');
select pg_temp.run('2026-04-05');
select pg_temp.expect_text('y se abre el día que toca', (pg_temp.ev('familia', 1)).status, 'abierta');
select pg_temp.run('2026-04-19');
select pg_temp.expect_text('papel del trimestre 1', (pg_temp.ev('alumno', 1)).due_on::text, '2026-04-27');
select pg_temp.expect('elegir la académica 9 días antes', (select count(*) from kiru_notifications where event_key like 'eval:' || (pg_temp.ev('alumno', 1)).id || ':elegir:%'), 2);
select pg_temp.expect_text('aún no se imprime', (pg_temp.ev('alumno', 1)).status, 'programada');
update kiru_evaluations set academic_status = 'aprobada', academic_path = 'x.pdf' where id = (pg_temp.ev('alumno', 1)).id;
select pg_temp.run('2026-04-23');
select pg_temp.expect_text('5 días antes, a imprimir', (pg_temp.ev('alumno', 1)).status, 'abierta');
select pg_temp.expect('con la académica aprobada no se avisa de que falta', (select count(*) from kiru_notifications where event_key like 'eval:' || (pg_temp.ev('alumno', 1)).id || ':academica_falta:%'), 0);

-- Si el mentor deja de llevar al alumno, lo suyo se cancela.
delete from student_mentors where student_id = pg_temp.i('S1');
select pg_temp.run('2026-04-24');
select pg_temp.expect_text('papel cancelado al cambiar de mentor', (pg_temp.ev('alumno', 1)).status, 'cancelada');

-- Alumno que ya llevaba tiempo: sin inicial.
update kiru_settings set value = value || jsonb_build_object('modo', 'activo') where key = 'evaluaciones';
insert into kiru_evaluation_students(student_id, skip_initial) values (pg_temp.i('S2'), true);
select pg_temp.run('2026-01-06');
select pg_temp.expect('sin evaluación inicial si se marca', (select count(*) from kiru_evaluations where student_id = pg_temp.i('S2') and cycle = 0), 0);

-- Nadie fuera del servidor lee ni escribe las evaluaciones.
set local role authenticated;
do $$ begin
  perform 1 from kiru_evaluations;
  raise exception 'FAIL authenticated lee kiru_evaluations';
exception when insufficient_privilege then raise notice 'ok  authenticated no lee kiru_evaluations (denied)';
end $$;
reset role;
rollback;
