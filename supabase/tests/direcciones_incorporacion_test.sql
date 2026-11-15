-- Dirección de clase desde el formulario de incorporación. Todo se deshace al final.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('P',gen_random_uuid()),('S1',gen_random_uuid()),('S2',gen_random_uuid()),('Q',gen_random_uuid()),('S3',gen_random_uuid());
insert into auth.users(id,email,raw_app_meta_data) select id, case k when 'P' then 'Padre@Prueba.es' else lower(k)||'@t' end,
  jsonb_build_object('kiru_role', case when k in ('P','Q') then 'padre' else 'alumno' end) from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
create function pg_temp.addr(k text) returns text language sql stable as $$ select class_address from students where profile_id = pg_temp.i(k) $$;
create function pg_temp.expect_text(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
update profiles set full_name = 'Álvaro Prueba' where id = pg_temp.i('S1');
update profiles set full_name = 'María Prueba' where id = pg_temp.i('S2');
update profiles set full_name = 'Lucía Otra' where id = pg_temp.i('S3');
insert into student_guardians(student_id, guardian_id) values
  (pg_temp.i('S1'), pg_temp.i('P')), (pg_temp.i('S2'), pg_temp.i('P')), (pg_temp.i('S3'), pg_temp.i('Q'));

select pg_temp.expect_text('resultado', kiru_familias_direcciones('[
  {"emails":["otro@x.es","padre@prueba.es"],"alumno":"alvaro vara","direccion":"Calle  Uno 1,\n Madrid"},
  {"emails":["q@t"],"alumno":"Lucía","direccion":"Calle Tres 3"},
  {"emails":["nadie@x.es"],"alumno":"Pepe","direccion":"Calle Cuatro"}]')::text,
  '{"ya_tenian": 0, "rellenadas": 2, "sin_alumno_en_campus": 1}');
select pg_temp.expect_text('varios hijos: elige por el nombre y sin tildes', pg_temp.addr('S1'), 'Calle Uno 1, Madrid');
select pg_temp.expect_text('al otro hijo no se le pone', pg_temp.addr('S2'), '');
select pg_temp.expect_text('un solo hijo: se enlaza por el correo', pg_temp.addr('S3'), 'Calle Tres 3');
select kiru_familias_direcciones('[{"emails":["q@t"],"alumno":"Lucía","direccion":"Otra calle"}]');
select pg_temp.expect_text('no pisa lo que ya hay', pg_temp.addr('S3'), 'Calle Tres 3');
rollback;
