-- Pruebas del cambio de intensidad: disponibilidad del mentor, opción «bajar» en la
-- renovación, elección del nuevo horario por la familia, confirmación del mentor y
-- aplicación en el horario semanal. Todo se deshace al final.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('P',gen_random_uuid()),
  ('S1',gen_random_uuid()),('S2',gen_random_uuid()),('M2',gen_random_uuid());
insert into auth.users(id,email,raw_app_meta_data) select id, lower(k)||'@t', jsonb_build_object('kiru_role', case k
  when 'A' then 'admin' when 'M' then 'mentor' when 'M2' then 'mentor' when 'P' then 'padre' else 'alumno' end) from ids;
grant select on ids to public;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
update profiles set full_name = 'Alondra Flores' where id = pg_temp.i('S1');
update profiles set full_name = 'Otro Alumno' where id = pg_temp.i('S2');
insert into student_mentors(student_id, mentor_id, assigned_at) values
  (pg_temp.i('S1'),pg_temp.i('M'), '2026-01-01'), (pg_temp.i('S2'),pg_temp.i('M'), '2026-01-01');
insert into student_guardians(student_id,guardian_id) values (pg_temp.i('S1'),pg_temp.i('P'));
-- Alondra: martes 17:45 y sábado 11:00. El otro alumno del mentor: jueves 17:00.
insert into kiru_student_schedule_slots(student_id, mentor_id, weekday, start_time, end_time) values
  (pg_temp.i('S1'), pg_temp.i('M'), 2, '17:45', '18:45'), (pg_temp.i('S1'), pg_temp.i('M'), 6, '11:00', '12:00'),
  (pg_temp.i('S2'), pg_temp.i('M'), 4, '17:00', '18:00');

create function pg_temp.as_user(k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub',pg_temp.i(k),'role','authenticated','app_metadata',
    json_build_object('kiru_role',(select raw_app_meta_data->>'kiru_role' from auth.users where id=pg_temp.i(k))))::text, true);
  set local role authenticated;
end $$;
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
create function pg_temp.fails(label text, q text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok  % (%)', label, sqlerrm; return; end;
  raise exception 'FAIL %: no dio error', label;
end $$;

-- 1. Disponibilidad del mentor.
select pg_temp.as_user('M');
select pg_temp.fails('franjas que se solapan no valen',
  $q$select kiru_disponibilidad_guardar('[{"weekday":1,"start":"16:00","end":"19:00"},{"weekday":1,"start":"18:00","end":"20:00"}]')$q$);
select pg_temp.fails('horas que no son en punto o y media no valen',
  $q$select kiru_disponibilidad_guardar('[{"weekday":1,"start":"16:10","end":"19:00"}]')$q$);
select kiru_disponibilidad_guardar('[{"weekday":4,"start":"16:00","end":"19:00"},{"weekday":1,"start":"17:00","end":"19:00"}]', 'Los viernes no');
select pg_temp.expect('el mentor ve su disponibilidad', (select jsonb_array_length(slots) from kiru_mentor_class_availability), 2);
reset role;
select pg_temp.as_user('M2');
select pg_temp.expect('otro mentor no la ve', (select count(*) from kiru_mentor_class_availability), 0);
select pg_temp.fails('otro mentor no puede cambiarla',
  format($q$select kiru_disponibilidad_guardar('[]', '', %L)$q$, pg_temp.i('M')));
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('la familia no ve la disponibilidad', (select count(*) from kiru_mentor_class_availability), 0);
reset role;

-- 2. Renovación con «bajar».
set local role service_role;
select kiru_renewal_publish('{"email":"p@t","alumno":"Alondra","fin":"2026-12-05","mentor":"M",
  "mantener_etiqueta":"Mantener 2 días por semana","mantener_precio":350,
  "subir_etiqueta":"Pasar a 3 días por semana","subir_precio":500,
  "bajar_etiqueta":"Bajar a 1 día por semana","bajar_precio":175}');
reset role;
select pg_temp.expect_text('la renovación guarda la opción de bajar', (select down_label || ' ' || down_price from kiru_renewals), 'Bajar a 1 día por semana 175.00');
select pg_temp.as_user('P');
select kiru_renewal_choose_months((select id from kiru_renewals), 'bajar', 1);
reset role;
select pg_temp.expect_text('elige bajar', (select plan from kiru_renewals), 'bajar');
select pg_temp.expect_text('el total es el de 1 día', (select kiru_private.renewal_total(r)::text from kiru_renewals r), '175.00');
select pg_temp.expect_text('se abre el cambio de horario 2 → 1', (select status || ' ' || from_days || '→' || to_days || ' ' || effective_from from kiru_schedule_changes),
  'elegir_familia 2→1 2026-12-05');
select pg_temp.expect('la familia recibe el aviso con correo', (select count(*) from kiru_notifications where kind = 'horario_elegir' and recipient_id = pg_temp.i('P') and email_status = 'pendiente'), 1);
select pg_temp.expect('al bajar no se molesta al mentor con la disponibilidad', (select count(*) from kiru_notifications where kind = 'disponibilidad_actualizar'), 0);
set local role service_role;
select pg_temp.expect_text('la hoja recibe «Bajar a 1 día» y 175', (select (kiru_renewal_sync('[]')->'pendientes'->0->>'plan_label') || ' ' || (kiru_renewal_sync('[]')->'pendientes'->0->>'plan_price')),
  'Bajar a 1 día por semana 175.00');
reset role;

-- 3. La familia elige.
select pg_temp.as_user('P');
reset role; -- (la identidad de la familia sigue puesta: así se puede guardar el resultado)
create temp table v as select kiru_horario_ver((select id from kiru_schedule_changes)) j;
grant select on v to public;
select pg_temp.as_user('P');
select pg_temp.expect('opciones: sus 2 clases actuales + huecos libres', (select count(*) from v, jsonb_array_elements(j->'options') o where (o->>'current')::boolean), 2);
select pg_temp.expect('no ofrece el jueves 17:00 (otro alumno)', (select count(*) from v, jsonb_array_elements(j->'options') o where o->>'weekday'='4' and o->>'start' in ('16:30','17:00','17:30')), 0);
select pg_temp.expect('sí ofrece el jueves 16:00 y 18:00', (select count(*) from v, jsonb_array_elements(j->'options') o where o->>'weekday'='4' and o->>'start' in ('16:00','18:00')), 2);
select pg_temp.expect('lunes 17:00 a 19:00: 17:00, 17:30, 18:00', (select count(*) from v, jsonb_array_elements(j->'options') o where o->>'weekday'='1'), 3);
select pg_temp.fails('tiene que elegir exactamente 1 día',
  $q$select kiru_horario_elegir((select id from kiru_schedule_changes), '[{"weekday":2,"start":"17:45"},{"weekday":6,"start":"11:00"}]')$q$);
select pg_temp.fails('no puede elegir un hueco ocupado',
  $q$select kiru_horario_elegir((select id from kiru_schedule_changes), '[{"weekday":4,"start":"17:00"}]')$q$);
select kiru_horario_elegir((select id from kiru_schedule_changes), '[{"weekday":6,"start":"11:00"}]', 'Mejor los sábados');
reset role;
select pg_temp.expect_text('queda pendiente del mentor', (select status from kiru_schedule_changes), 'confirmar_mentor');
select pg_temp.expect('el mentor recibe aviso con correo', (select count(*) from kiru_notifications where kind = 'horario_confirmar' and recipient_id = pg_temp.i('M') and email_status = 'pendiente'), 1);
select pg_temp.expect_text('texto del horario', (select body from kiru_notifications where kind = 'horario_confirmar'),
  'Su familia ha elegido: sábado 11:00, a partir del 05/12. Entra en tu panel para confirmarlo o pedir otro horario.');

-- 4. El mentor pide otro, la familia vuelve a elegir y el mentor confirma.
select pg_temp.as_user('M2');
select pg_temp.fails('otro mentor no decide', $q$select kiru_horario_decidir((select id from kiru_schedule_changes), true)$q$);
reset role;
select pg_temp.as_user('M');
select pg_temp.fails('para pedir otro horario hay que explicar por qué', $q$select kiru_horario_decidir((select id from kiru_schedule_changes), false, '')$q$);
select kiru_horario_decidir((select id from kiru_schedule_changes), false, 'Los sábados ya no puedo, ¿martes?');
reset role;
select pg_temp.expect_text('vuelve a la familia', (select status from kiru_schedule_changes), 'elegir_familia');
select pg_temp.expect('la familia recibe «elige otro»', (select count(*) from kiru_notifications where kind = 'horario_otro'), 1);
select pg_temp.as_user('P');
select kiru_horario_elegir((select id from kiru_schedule_changes), '[{"weekday":2,"start":"17:45"}]');
reset role;
select pg_temp.as_user('M');
select kiru_horario_decidir((select id from kiru_schedule_changes), true, '');
reset role;
select pg_temp.expect_text('confirmado, aún no aplicado (empieza el 05/12)', (select status from kiru_schedule_changes), 'confirmado');
select pg_temp.expect('la familia recibe la confirmación', (select count(*) from kiru_notifications where kind = 'horario_confirmado'), 1);
select pg_temp.expect('el horario sigue igual hasta entonces', (select count(*) from kiru_student_schedule_slots where student_id = pg_temp.i('S1') and is_active), 2);

-- 5. Llega la fecha: se aplica.
update kiru_schedule_changes set effective_from = current_date;
set local role service_role;
select kiru_horarios_tarea_diaria();
reset role;
select pg_temp.expect_text('aplicado', (select status from kiru_schedule_changes), 'aplicado');
select pg_temp.expect('queda 1 clase a la semana', (select count(*) from kiru_student_schedule_slots where student_id = pg_temp.i('S1') and is_active), 1);
select pg_temp.expect_text('el martes 17:45', (select weekday || ' ' || start_time from kiru_student_schedule_slots where student_id = pg_temp.i('S1') and is_active), '2 17:45:00');
select pg_temp.expect('el sábado queda guardado pero inactivo', (select count(*) from kiru_student_schedule_slots where student_id = pg_temp.i('S1') and not is_active), 1);
set local role service_role;
select pg_temp.expect_text('la hoja recibe 1 día y 175 €', (select (j->0->>'dias') || ' ' || (j->0->>'precio') from (select kiru_horarios_para_hoja() j) x), '1 175.00');
select pg_temp.expect('la hoja lo confirma', kiru_horarios_hoja_ok(array(select id from kiru_schedule_changes)), 1);
select pg_temp.expect('ya no hay nada pendiente para la hoja', jsonb_array_length(kiru_horarios_para_hoja()), 0);
reset role;

-- 6. Subir con un mentor sin disponibilidad al día: se le pide actualizarla.
set local role service_role;
select kiru_renewal_publish('{"email":"p@t","alumno":"Alondra","fin":"2027-01-05","mentor":"M",
  "mantener_etiqueta":"Mantener 1 día por semana","mantener_precio":175,
  "subir_etiqueta":"Pasar a 2 días por semana","subir_precio":350}');
reset role;
update kiru_mentor_class_availability set updated_at = now() - interval '40 days';
select pg_temp.as_user('P');
select kiru_renewal_choose_months((select id from kiru_renewals where period_end = '2027-01-05'), 'subir', 1);
reset role;
select pg_temp.expect_text('subir abre un cambio 1 → 2', (select from_days || '→' || to_days from kiru_schedule_changes where status = 'elegir_familia'), '1→2');
select pg_temp.expect('el mentor recibe «actualiza tu disponibilidad»', (select count(*) from kiru_notifications where kind = 'disponibilidad_actualizar' and recipient_id = pg_temp.i('M')), 1);
select pg_temp.as_user('M');
select kiru_disponibilidad_guardar('[{"weekday":4,"start":"16:00","end":"19:00"}]');
reset role;
select pg_temp.expect('al guardarla el aviso queda leído', (select count(*) from kiru_notifications where kind = 'disponibilidad_actualizar' and read_at is null), 0);
select pg_temp.as_user('P');
select kiru_horario_elegir((select id from kiru_schedule_changes where status = 'elegir_familia'), '[{"weekday":2,"start":"17:45"},{"weekday":4,"start":"18:00"}]');
reset role;
select pg_temp.expect_text('elige martes + jueves 18:00', (select kiru_private.slots_text(chosen_slots) from kiru_schedule_changes where status = 'confirmar_mentor'), 'martes 17:45 y jueves 18:00');

-- 7. Recordatorio único a los 2 días.
update kiru_schedule_changes set chosen_at = now() - interval '3 days', created_at = now() - interval '5 days' where status = 'confirmar_mentor';
set local role service_role;
select kiru_horarios_tarea_diaria();
select kiru_horarios_tarea_diaria();
reset role;
select pg_temp.expect('un solo recordatorio al mentor', (select count(*) from kiru_notifications where kind = 'horario_confirmar' and event_key like '%:recordatorio'), 1);

-- 8. Admin cancela.
select pg_temp.as_user('P');
select pg_temp.fails('la familia no puede cancelar', $q$select kiru_horario_cancelar((select id from kiru_schedule_changes where status = 'confirmar_mentor'))$q$);
reset role;
select pg_temp.as_user('A');
select kiru_horario_cancelar((select id from kiru_schedule_changes where status = 'confirmar_mentor'));
reset role;
select pg_temp.expect('no quedan cambios abiertos', (select count(*) from kiru_schedule_changes where status in ('elegir_familia','confirmar_mentor','confirmado')), 0);

rollback;
