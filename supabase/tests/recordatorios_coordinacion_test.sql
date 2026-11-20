-- Pruebas de los recordatorios a Coordinación: fichas de Cálculalo (días 1 y 5) y evidencias
-- enviadas sin revisar. Todo dentro de una transacción que se deshace al final.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('M2',gen_random_uuid()),('C',gen_random_uuid()),
  ('S1',gen_random_uuid()),('S2',gen_random_uuid()),('S3',gen_random_uuid());
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'A' then 'admin' when 'M' then 'mentor' when 'M2' then 'mentor' when 'C' then 'coordinador' else 'alumno' end),
  jsonb_build_object('full_name', k || ' Prueba') from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
create function pg_temp.expect(label text, got numeric, want numeric) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function pg_temp.n(k text, kind text) returns bigint language sql stable as $$
  select count(*) from kiru_notifications where recipient_id = pg_temp.i(k) and kind = n.kind $$;

-- M (coordinado por C) con S1 y S2; M2 sin coordinador (avisos a Administración) con S3.
insert into student_mentors(student_id, mentor_id, assigned_at) values
  (pg_temp.i('S1'), pg_temp.i('M'), date '2027-01-10'), (pg_temp.i('S2'), pg_temp.i('M'), date '2027-01-10'),
  (pg_temp.i('S3'), pg_temp.i('M2'), date '2027-01-10');
insert into kiru_coordinator_mentors(mentor_id, coordinator_id) values (pg_temp.i('M'), pg_temp.i('C'));
update kiru_perf_settings set data_from = date '2027-01-01';

-- 1. En modo oculto no sale nada.
update kiru_perf_settings set mode = 'oculto';
select pg_temp.expect('modo oculto: ningún recordatorio', kiru_private.coordination_reminders(date '2027-06-01'), 0);

update kiru_perf_settings set mode = 'aprendizaje';
-- 2. Antes de la fecha de inicio no se piden fichas (diciembre de 2026).
select pg_temp.expect('no pide fichas de meses anteriores al inicio', kiru_private.coordination_reminders(date '2027-01-01'), 0);
-- 3. Día 1: una notificación para C (S1 y S2) y otra para Administración (S3).
insert into kiru_calculalo_checks(student_id, mentor_id, month, mentor_prepared) values (pg_temp.i('S2'), pg_temp.i('M'), date '2027-05-01', true);
select pg_temp.expect('día 1: un aviso por coordinador', kiru_private.coordination_reminders(date '2027-06-01'), 2);
select pg_temp.expect('C recibe el aviso de fichas', pg_temp.n('C', 'coordinacion_pendiente'), 1);
select pg_temp.expect('la lista solo trae a S1 (S2 ya tiene ficha)',
  (select count(*) from kiru_notifications where recipient_id = pg_temp.i('C') and body like '%S1%' and body not like '%S2%'), 1);
select pg_temp.expect('Administración recibe lo del mentor sin coordinador', pg_temp.n('A', 'coordinacion_pendiente'), 1);
select pg_temp.expect('el aviso lleva correo', (select count(*) from kiru_notifications where recipient_id = pg_temp.i('C') and email_status = 'pendiente'), 1);
select pg_temp.expect('el mismo día no se repite', kiru_private.coordination_reminders(date '2027-06-01'), 0);
select pg_temp.expect('otros días no se pide nada', kiru_private.coordination_reminders(date '2027-06-03'), 0);
-- 4. Día 5: recordatorio solo a quien le falta alguna.
insert into kiru_calculalo_checks(student_id, mentor_id, month, mentor_prepared) values (pg_temp.i('S1'), pg_temp.i('M'), date '2027-05-01', false);
select pg_temp.expect('día 5: solo a Administración (C ya terminó)', kiru_private.coordination_reminders(date '2027-06-05'), 1);
select pg_temp.expect('C sigue con un único aviso', pg_temp.n('C', 'coordinacion_pendiente'), 1);

-- 5. Evidencia enviada: a los 2 días laborables, recordatorio a C (una vez).
insert into kiru_material_evidence(mentor_id, student_id, kind, bimester_start, bimester_end, due_at, status, status_since, submitted_at)
values (pg_temp.i('M'), pg_temp.i('S1'), 'mision', date '2027-01-10', date '2027-03-10', now() - interval '1 day', 'entregada', now() - interval '1 hour', now() - interval '1 hour');
select pg_temp.expect('recién enviada: aún no', kiru_private.coordination_reminders(date '2027-06-10'), 0);
update kiru_material_evidence set status_since = now() - interval '6 days' where student_id = pg_temp.i('S1');
select pg_temp.expect('tras 2 días laborables: recordatorio', kiru_private.coordination_reminders(date '2027-06-10'), 1);
select pg_temp.expect('no se repite', kiru_private.coordination_reminders(date '2027-06-11'), 0);
select pg_temp.expect('C tiene ya dos avisos', pg_temp.n('C', 'coordinacion_pendiente'), 2);
update kiru_material_evidence set status = 'validada', validated_at = now(), validated_by = pg_temp.i('C') where student_id = pg_temp.i('S1');
select pg_temp.expect('validada: nada más', kiru_private.coordination_reminders(date '2027-06-15'), 0);

-- 7. Cada lunes: repaso de Supervisión para C y para Administración (mentor sin coordinador).
select pg_temp.expect('lunes: un repaso por coordinador', kiru_private.coordination_reminders(date '2027-06-14'),
  2);
select pg_temp.expect('el repaso no se repite el mismo lunes', kiru_private.coordination_reminders(date '2027-06-14'), 0);
select pg_temp.expect('martes: nada', kiru_private.coordination_reminders(date '2027-06-15'), 0);

-- 6. La tarea diaria lo incluye.
select pg_temp.expect('la tarea diaria informa de los recordatorios de Coordinación',
  (select (public.kiru_evidencias_tarea_diaria() ? 'recordatorios_coordinacion')::int), 1);
rollback;
