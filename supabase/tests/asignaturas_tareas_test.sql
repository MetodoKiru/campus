-- Pruebas de asignaturas, tareas y entregas: permisos, estados, avisos y fin de curso.
-- Todo ocurre dentro de una transacción que se deshace al final; no deja datos.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('M',gen_random_uuid()),('M2',gen_random_uuid()),('C',gen_random_uuid()),('P',gen_random_uuid()),
  ('S1',gen_random_uuid()),('S2',gen_random_uuid()),('S3',gen_random_uuid()),('A',gen_random_uuid());
grant select on ids to authenticated, anon;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'M' then 'mentor' when 'M2' then 'mentor' when 'C' then 'coordinador' when 'P' then 'padre' when 'A' then 'admin' else 'alumno' end),
  jsonb_build_object('full_name', k || ' Prueba') from ids;
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
create function pg_temp.as_user(k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.i(k), 'role', 'authenticated')::text, true);
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

insert into student_mentors (student_id, mentor_id) values (pg_temp.i('S1'), pg_temp.i('M')), (pg_temp.i('S2'), pg_temp.i('M')), (pg_temp.i('S3'), pg_temp.i('M2'));
insert into student_guardians (student_id, guardian_id) values (pg_temp.i('S1'), pg_temp.i('P'));
insert into kiru_coordinator_mentors (coordinator_id, mentor_id) values (pg_temp.i('C'), pg_temp.i('M'));
create temp table v(k text primary key, id uuid);
grant all on v to authenticated;

-- 1. Asignaturas comunes y propias ------------------------------------------------------------------
select pg_temp.expect('7 asignaturas comunes', (select count(*) from kiru_subjects where code is not null and owner_mentor_id is null), 7);
select pg_temp.as_user('M');
set local role authenticated;
insert into v select 'lengua_red', kiru_subject_create('Lengua – redacciones');
select pg_temp.expect('mismo nombre no duplica', (select count(*) from v where id = kiru_subject_create('  lengua – REDACCIONES ')), 1);
select pg_temp.expect_text('la asignatura es del mentor', (select owner_mentor_id::text from kiru_subjects where id = (select id from v where k = 'lengua_red')), pg_temp.i('M')::text);
select kiru_student_subject_set(pg_temp.i('S1'), (select id from v where k = 'lengua_red'), true);
select kiru_student_subject_set(pg_temp.i('S1'), (select id from kiru_subjects where code = 'len'), true);
do $$ begin
  perform kiru_student_subject_set(pg_temp.i('S3'), (select id from kiru_subjects where code = 'len'), true);
  raise exception 'FAIL mentor cambia asignaturas de alumno ajeno: se permitió';
exception when insufficient_privilege then raise notice 'ok  alumno ajeno (denied)';
end $$;
do $$ begin
  insert into kiru_subjects (name) values ('Hackeo');
  raise exception 'FAIL insert directo: se permitió';
exception when insufficient_privilege then raise notice 'ok  sin escritura directa (denied)';
end $$;
reset role;

select pg_temp.as_user('M2');
set local role authenticated;
select pg_temp.expect('otro mentor no ve la asignatura propia', (select count(*) from kiru_subjects where id = (select id from v where k = 'lengua_red')), 0);
do $$ begin
  perform kiru_subject_item_send(array[pg_temp.i('S3')], (select id from v where k = 'lengua_red'), 'recurso', 'x');
  raise exception 'FAIL usar asignatura de otro mentor: se permitió';
exception when insufficient_privilege then raise notice 'ok  asignatura de otro mentor (denied)';
end $$;
reset role;

-- 2. Mandar recurso, pregunta y tarea --------------------------------------------------------------
select pg_temp.as_user('M');
set local role authenticated;
insert into v select 'tarea', (kiru_subject_item_send(array[pg_temp.i('S1')], (select id from kiru_subjects where code = 'len'), 'tarea',
  'Haz la redacción que te dije', 'Mínimo 200 palabras', null, now() + interval '2 days', true))[1];
insert into v select 'tarea_corta', (kiru_subject_item_send(array[pg_temp.i('S1')], (select id from kiru_subjects where code = 'len'), 'tarea',
  'Ejercicio corto', '', null, now() + interval '1 hour', false))[1];
insert into v select 'pregunta', (kiru_subject_item_send(array[pg_temp.i('S1')], (select id from kiru_subjects where code = 'len'), 'pregunta',
  '¿Has hecho los ejercicios de la página 40?'))[1];
insert into v select 'recurso', (kiru_subject_item_send(array[pg_temp.i('S1'), pg_temp.i('S2')], (select id from kiru_subjects where code = 'geo'), 'recurso',
  'Mapas de ríos', '', 'seterra.com'))[1];
select pg_temp.expect_text('enlace con https', (select url from kiru_subject_items where id = (select id from v where k = 'recurso')), 'https://seterra.com');
select pg_temp.expect('recurso a dos alumnos', (select count(*) from kiru_subject_items where kind = 'recurso'), 2);
select pg_temp.expect('activa la asignatura al mandar', (select count(*) from kiru_student_subjects where student_id = pg_temp.i('S2') and subject_id = (select id from kiru_subjects where code = 'geo')), 1);
do $$ begin
  perform kiru_subject_item_send(array[pg_temp.i('S1')], (select id from kiru_subjects where code = 'len'), 'tarea', 'Sin plazo');
  raise exception 'FAIL tarea sin plazo: se permitió';
exception when raise_exception then raise notice 'ok  tarea sin plazo (denied)';
end $$;
do $$ begin
  perform kiru_subject_item_send(array[pg_temp.i('S3')], (select id from kiru_subjects where code = 'len'), 'recurso', 'x');
  raise exception 'FAIL mandar a alumno ajeno: se permitió';
exception when insufficient_privilege then raise notice 'ok  mandar a alumno ajeno (denied)';
end $$;
reset role;
select pg_temp.expect('aviso de tarea nueva al alumno', (select count(*) from kiru_notifications where recipient_id = pg_temp.i('S1') and kind = 'tarea_nueva'), 3);

-- 3. Quién ve qué -----------------------------------------------------------------------------------
select pg_temp.as_user('S1');
set local role authenticated;
select pg_temp.expect('alumno ve lo suyo', (select count(*) from kiru_subject_items), 4);
select pg_temp.expect_text('estado pendiente', (select status from kiru_subject_items_status where id = (select id from v where k = 'tarea')), 'pendiente');
select pg_temp.expect('alumno ve su asignatura propia', (select count(*) from kiru_subjects where id = (select id from v where k = 'lengua_red')), 1);
reset role;
select pg_temp.as_user('S2');
set local role authenticated;
select pg_temp.expect('otro alumno solo ve lo suyo', (select count(*) from kiru_subject_items), 1);
reset role;
select pg_temp.as_user('P');
set local role authenticated;
select pg_temp.expect('familia no lee el contenido', (select count(*) from kiru_subject_items), 0);
select pg_temp.expect('familia ve el estado de las tareas', (select count(*) from kiru_family_subject_tasks(pg_temp.i('S1'))), 2);
do $$ begin
  perform * from kiru_family_subject_tasks(pg_temp.i('S2'));
  raise exception 'FAIL familia ve otro alumno: se permitió';
exception when insufficient_privilege then raise notice 'ok  familia de otro alumno (denied)';
end $$;
reset role;
select pg_temp.as_user('C');
set local role authenticated;
select pg_temp.expect('coordinador ve su grupo', (select count(*) from kiru_subject_items), 5);
reset role;
select pg_temp.as_user('M2');
set local role authenticated;
select pg_temp.expect('otro mentor no ve nada', (select count(*) from kiru_subject_items), 0);
reset role;

-- 4. Entregas -----------------------------------------------------------------------------------------
insert into storage.objects (bucket_id, name) values ('kiru-entregas', pg_temp.i('S1') || '/' || (select id from v where k = 'tarea') || '/redaccion.jpg');
select pg_temp.as_user('S1');
set local role authenticated;
select pg_temp.expect('puede subir a su carpeta', kiru_private.can_upload_submission(pg_temp.i('S1') || '/' || (select id from v where k = 'tarea') || '/x.pdf')::int, 1);
select pg_temp.expect('no puede subir a otra carpeta', kiru_private.can_upload_submission(pg_temp.i('S2') || '/' || (select id from v where k = 'tarea') || '/x.pdf')::int, 0);
do $$ begin
  perform kiru_subject_submit((select id from v where k = 'tarea'), null, 'sin foto');
  raise exception 'FAIL tarea con archivo obligatorio sin archivo: se permitió';
exception when raise_exception then raise notice 'ok  archivo obligatorio (denied)';
end $$;
select kiru_subject_submit((select id from v where k = 'tarea'), null, 'Aquí está',
  jsonb_build_array(jsonb_build_object('path', pg_temp.i('S1') || '/' || (select id from v where k = 'tarea') || '/redaccion.jpg', 'name', 'redaccion.jpg', 'mime', 'image/jpeg', 'size', 1234)));
select pg_temp.expect_text('estado a tiempo', (select status from kiru_subject_items_status where id = (select id from v where k = 'tarea')), 'a_tiempo');
select kiru_subject_submit((select id from v where k = 'pregunta'), 'a_medias', '');
select pg_temp.expect_text('pregunta respondida', (select status || ':' || last_answer from kiru_subject_items_status where id = (select id from v where k = 'pregunta')), 'respondida:a_medias');
select kiru_subject_item_seen(array(select id from kiru_subject_items where kind = 'recurso'));
select pg_temp.expect_text('recurso visto', (select status from kiru_subject_items_status where kind = 'recurso'), 'visto');
do $$ begin
  update kiru_subject_submissions set comment = 'cambiado';
  raise exception 'FAIL editar entrega: se permitió';
exception when insufficient_privilege then raise notice 'ok  entregas no se editan (denied)';
end $$;
reset role;
select pg_temp.expect('aviso al mentor por la entrega', (select count(*) from kiru_notifications where recipient_id = pg_temp.i('M') and kind = 'tarea_entregada'), 2);
select pg_temp.as_user('S2');
set local role authenticated;
do $$ begin
  perform kiru_subject_submit((select id from v where k = 'pregunta'), 'si', '');
  raise exception 'FAIL entregar tarea ajena: se permitió';
exception when insufficient_privilege then raise notice 'ok  tarea ajena (denied)';
end $$;
select pg_temp.expect('otro alumno no lee archivos', kiru_private.can_read_submission(pg_temp.i('S1') || '/' || (select id from v where k = 'tarea') || '/redaccion.jpg')::int, 0);
reset role;
select pg_temp.as_user('P');
set local role authenticated;
select pg_temp.expect('familia no abre archivos', kiru_private.can_read_submission(pg_temp.i('S1') || '/' || (select id from v where k = 'tarea') || '/redaccion.jpg')::int, 0);
reset role;

-- 5. Plazo vencido: no entregada y luego tarde ----------------------------------------------------------
update kiru_subject_items set due_at = now() - interval '1 hour' where id = (select id from v where k = 'tarea_corta');
select pg_temp.expect_text('no entregada', (select status from kiru_subject_items_status where id = (select id from v where k = 'tarea_corta')), 'no_entregada');
select pg_temp.as_user('S1');
set local role authenticated;
select kiru_subject_submit((select id from v where k = 'tarea_corta'), null, 'Lo hice tarde');
reset role;
select pg_temp.expect_text('entregada tarde', (select status from kiru_subject_items_status where id = (select id from v where k = 'tarea_corta')), 'tarde');
select pg_temp.expect('marcada tarde en la entrega', (select count(*) from kiru_subject_submissions where item_id = (select id from v where k = 'tarea_corta') and late), 1);
select pg_temp.expect('resumen: 1 a tiempo y 1 tarde',
  (select a_tiempo * 100 + tarde * 10 + pendiente from kiru_subject_task_summary(array[pg_temp.i('S1')], 30)), 110);

-- 6. Revisión del mentor ------------------------------------------------------------------------------------
select pg_temp.as_user('M');
set local role authenticated;
select kiru_subject_item_review((select id from v where k = 'tarea'), '¡Muy bien!');
reset role;
select pg_temp.expect('aviso de revisión al alumno', (select count(*) from kiru_notifications where recipient_id = pg_temp.i('S1') and kind = 'tarea_revisada'), 1);

-- 7. Tarea horaria: recordatorio 24 h antes y resumen al mentor ---------------------------------------------
select pg_temp.as_user('M');
set local role authenticated;
insert into v select 'tarea_manana', (kiru_subject_item_send(array[pg_temp.i('S2')], (select id from kiru_subjects where code = 'len'), 'tarea',
  'Para mañana', '', null, now() + interval '3 days'))[1];
do $$ begin
  perform kiru_tareas_tarea_horaria();
  raise exception 'FAIL mentor ejecuta tarea horaria: se permitió';
exception when insufficient_privilege then raise notice 'ok  tarea horaria solo servidor (denied)';
end $$;
reset role;
update kiru_subject_items set due_at = now() + interval '20 hours', created_at = now() - interval '3 days' where id = (select id from v where k = 'tarea_manana');
select kiru_tareas_tarea_horaria();
select kiru_tareas_tarea_horaria();
select pg_temp.expect('recordatorio una sola vez', (select count(*) from kiru_notifications where kind = 'tarea_recordatorio'), 1);

-- 8. Fin de curso ---------------------------------------------------------------------------------------------
update kiru_subject_files set deleted_at = null where false;
alter table kiru_subject_files disable trigger kiru_subject_files_append_only;
update kiru_subject_files set created_at = now() - interval '400 days';
alter table kiru_subject_files enable trigger kiru_subject_files_append_only;
select pg_temp.expect('archivo caducado listado', (select count(*) from kiru_entregas_caducadas(100)), 1);
select pg_temp.expect('marcado borrado', kiru_entregas_marcar_borradas(array(select storage_path from kiru_entregas_caducadas(100))), 1);
select pg_temp.expect('ya no se lista', (select count(*) from kiru_entregas_caducadas(100)), 0);
select pg_temp.expect('la entrega se queda', (select count(*) from kiru_subject_submissions where item_id = (select id from v where k = 'tarea')), 1);
do $$ begin
  update kiru_subject_files set file_name = 'otro';
  raise exception 'FAIL cambiar archivo: se permitió';
exception when insufficient_privilege then raise notice 'ok  archivo no se cambia (denied)';
end $$;

-- 9. Borrar un alumno arrastra sus entregas ---------------------------------------------------------------------
delete from kiru_subject_items where id = (select id from v where k = 'pregunta');
select pg_temp.expect('borrado en cascada', (select count(*) from kiru_subject_submissions where item_id = (select id from v where k = 'pregunta')), 0);

-- 10. Avisos nuevos permitidos y anteriores intactos --------------------------------------------------------------
select pg_temp.expect('tipos anteriores siguen', (select count(*) from pg_constraint where conname = 'kiru_notifications_kind_check'
  and pg_get_constraintdef(oid) like '%objetivo_pendiente%' and pg_get_constraintdef(oid) like '%tarea_recordatorio%'), 1);

rollback;
