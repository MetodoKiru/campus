-- Pruebas de los ajustes de avisos (20/11/2026): la renovación avisa por correo a los demás
-- adultos de la familia (no al de la hoja, que recibe el borrador) y los ajustes de resumen
-- y tope quedan creados. Todo se deshace al final.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('P1',gen_random_uuid()),('P2',gen_random_uuid()),('P3',gen_random_uuid()),('S',gen_random_uuid());
insert into auth.users(id,email,raw_app_meta_data) select id,
  case k when 'P3' then 'p3@familias.campus-kiru.invalid' else lower(k)||'@t' end,
  jsonb_build_object('kiru_role', case k when 'A' then 'admin' when 'S' then 'alumno' else 'padre' end) from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
create function pg_temp.expect_text(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
update profiles set full_name = 'Lucía Prueba' where id = pg_temp.i('S');
insert into student_guardians(student_id,guardian_id) values (pg_temp.i('S'),pg_temp.i('P1')),(pg_temp.i('S'),pg_temp.i('P2')),(pg_temp.i('S'),pg_temp.i('P3'));

select kiru_renewal_publish('{"email":"P1@t","alumno":"Lucía","fin":"2026-12-13","mentor":"M",
  "mantener_etiqueta":"Mantener 1 día por semana","mantener_precio":175}');
select pg_temp.expect_text('los tres adultos ven la renovación en la campanita',
  (select count(*)::text from kiru_notifications where kind = 'renovacion' and student_id = pg_temp.i('S')), '3');
select pg_temp.expect_text('el adulto de la hoja no recibe un segundo correo',
  (select email_status from kiru_notifications where kind = 'renovacion' and recipient_id = pg_temp.i('P1')), 'no_aplica');
select pg_temp.expect_text('el otro adulto recibe el aviso por correo',
  (select email_status from kiru_notifications where kind = 'renovacion' and recipient_id = pg_temp.i('P2')), 'pendiente');
select pg_temp.expect_text('un adulto sin correo real no lleva correo',
  (select email_status from kiru_notifications where kind = 'renovacion' and recipient_id = pg_temp.i('P3')), 'no_aplica');
select kiru_renewal_publish('{"email":"p1@t","alumno":"Lucía","fin":"2026-12-13","mentor":"M",
  "mantener_etiqueta":"Mantener 1 día por semana","mantener_precio":175}');
select pg_temp.expect_text('publicar dos veces no repite el aviso',
  (select count(*)::text from kiru_notifications where kind = 'renovacion' and student_id = pg_temp.i('S')), '3');

select pg_temp.expect_text('tope de familias: 3 al día y 5 a la semana',
  (select (value->>'dia') || ' ' || (value->>'semana') || ' ' || (value->>'activo') from kiru_settings where key = 'avisos_tope_familias'), '3 5 true');
select pg_temp.expect_text('la evaluación nunca entra en el tope',
  (select (value->'exentos' ? 'evaluacion_trimestral')::text from kiru_settings where key = 'avisos_tope_familias'), 'true');
select pg_temp.expect_text('resumen: equipo a las 19:00 y administración a las 8:00',
  (select (value->>'hora') || ' ' || (value->'hora_por_rol'->>'admin') || ' ' || (value->'roles' ? 'admin')::text from kiru_settings where key = 'avisos_resumen'), '19 8 true');
rollback;
