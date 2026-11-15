-- Pruebas del formulario de disponibilidad v2: seguir con las clases, días extra,
-- sin mañanas entre semana, zonas, dirección del alumno y aviso al coordinador.
-- Todo se deshace al final.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('C',gen_random_uuid()),('S1',gen_random_uuid()),('S2',gen_random_uuid()),('X',gen_random_uuid());
insert into auth.users(id,email,raw_app_meta_data) select id, lower(k)||'@t', jsonb_build_object('kiru_role', case k
  when 'A' then 'admin' when 'M' then 'mentor' when 'C' then 'coordinador' else 'alumno' end) from ids;
grant select on ids to public;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
update profiles set full_name = 'Paula Prueba' where id = pg_temp.i('M');
update profiles set full_name = 'Álvaro Prueba' where id = pg_temp.i('S1');
insert into student_mentors(student_id, mentor_id, assigned_at) values (pg_temp.i('S1'),pg_temp.i('M'),'2026-01-01');
insert into kiru_coordinator_mentors(mentor_id, coordinator_id) values (pg_temp.i('M'), pg_temp.i('C'));
insert into kiru_student_schedule_slots(student_id, mentor_id, weekday, start_time, end_time) values
  (pg_temp.i('S1'), pg_temp.i('M'), 1, '19:00', '20:00'), (pg_temp.i('S1'), pg_temp.i('M'), 3, '19:00', '20:00');
create function pg_temp.as_user(k text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',pg_temp.i(k),'role','authenticated','app_metadata',
    json_build_object('kiru_role',(select raw_app_meta_data->>'kiru_role' from auth.users where id=pg_temp.i(k))))::text, true);
  set local role authenticated;
end $$;
create function pg_temp.expect_text(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function pg_temp.fails(label text, q text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok  % (%)', label, sqlerrm; return; end;
  raise exception 'FAIL %: no dio error', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Paso 1 obligatorio y explicación si no puede seguir.
select pg_temp.as_user('M');
select pg_temp.fails('hay que contestar si sigue con sus clases', $q$select kiru_disponibilidad_enviar('{"slots":[]}')$q$);
select pg_temp.fails('si no puede, tiene que explicar qué cambia', $q$select kiru_disponibilidad_enviar('{"keeps":false}')$q$);

-- 2. Envío completo: mañanas entre semana fuera, día extra sumado sin chocar, zonas y transporte.
select kiru_disponibilidad_enviar(format('{"keeps":true,"from":"Moncloa","transport":["transporte_publico","avion"],
  "zones":["Aravaca"," Chamberí "],"slots":[{"weekday":2,"start":"10:00","end":"19:00"},{"weekday":6,"start":"10:00","end":"12:00"}],
  "extra":[{"student_id":"%s","weekday":2,"start":"18:30","arrive":"justo"},{"student_id":"%s","weekday":4,"start":"19:30"}],
  "notes":"exámenes en enero"}', pg_temp.i('S1'), pg_temp.i('X'))::jsonb);
reset role;
select pg_temp.expect_text('martes por la mañana se recorta a las 16:00 y el extra no choca',
  (select slots::text from kiru_mentor_class_availability where mentor_id = pg_temp.i('M')),
  '[{"end": "19:30", "start": "16:00", "weekday": 2}, {"end": "12:00", "start": "10:00", "weekday": 6}]');
select pg_temp.expect_text('solo transporte válido', (select transport::text from kiru_mentor_class_availability where mentor_id = pg_temp.i('M')), '{transporte_publico}');
select pg_temp.expect_text('zonas limpias', (select array_to_string(zones, '|') from kiru_mentor_class_availability where mentor_id = pg_temp.i('M')), 'Aravaca|Chamberí');
select pg_temp.expect_text('día extra de un alumno que no es suyo se ignora',
  (select jsonb_array_length(extra_days)::text from kiru_mentor_class_availability where mentor_id = pg_temp.i('M')), '1');
select pg_temp.expect_text('el coordinador recibe correo',
  (select title || ' / ' || email_status from kiru_notifications where recipient_id = pg_temp.i('C') and kind = 'disponibilidad_enviada'),
  'Paula ha actualizado su disponibilidad / pendiente');
select pg_temp.expect_text('el resumen dice el día extra',
  (select (body like '%Álvaro, si quisiera un día más: podría el martes 18:30–19:30 (llega justo)%')::text
   from kiru_notifications where recipient_id = pg_temp.i('C') and kind = 'disponibilidad_enviada'), 'true');

-- 3. «Ya no puedo alguna»: aviso urgente; «ningún día más» bloquea subir.
select pg_temp.as_user('M');
select kiru_disponibilidad_enviar(format('{"keeps":false,"keeps_note":"Desde diciembre no puedo los miércoles","slots":[{"weekday":2,"start":"16:00","end":"20:30"}],
  "extra":[{"student_id":"%s","weekday":null}]}', pg_temp.i('S1'))::jsonb);
reset role;
select pg_temp.expect_text('aviso urgente al coordinador',
  (select title from kiru_notifications where recipient_id = pg_temp.i('C') and kind = 'disponibilidad_enviada' and title like '⚠️%'),
  '⚠️ Paula ya no puede dar alguna de sus clases');
select pg_temp.expect_text('con «ningún día más» no se ofrece subir', kiru_private.can_raise(pg_temp.i('M'), pg_temp.i('S1'))::text, 'false');

-- 4. «Sigue igual» también avisa.
select pg_temp.as_user('M');
select kiru_disponibilidad_sigue_igual();
reset role;
select pg_temp.expect_text('«sigue igual» avisa al coordinador',
  (select count(*)::text from kiru_notifications where recipient_id = pg_temp.i('C') and kind = 'disponibilidad_enviada'), '3');

-- 5. Dirección del alumno y zonas.
select pg_temp.as_user('M');
select pg_temp.fails('el mentor no cambia la dirección', format($q$select kiru_alumno_direccion(%L, 'Calle Falsa 1')$q$, pg_temp.i('S1')));
select pg_temp.fails('el mentor no cambia las zonas', $q$select kiru_zonas_mentores_guardar(ARRAY['Tres Cantos'])$q$);
select pg_temp.as_user('C');
select kiru_alumno_direccion(pg_temp.i('S1'), '  Calle de Arturo Soria 100, Madrid ');
select pg_temp.as_user('M');
select pg_temp.expect_text('el mentor ve la dirección de su alumno',
  (select class_address from students where profile_id = pg_temp.i('S1')), 'Calle de Arturo Soria 100, Madrid');
select pg_temp.as_user('A');
select kiru_zonas_mentores_guardar(ARRAY['Tres Cantos', 'tres cantos ', 'Aravaca', '']);
select pg_temp.expect_text('zonas sin repetidas ni vacías', kiru_zonas_mentores()::text, '["Tres Cantos", "Aravaca"]');

rollback;
