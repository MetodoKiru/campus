-- Pruebas de «Registro de sesiones» y «Mis pagos» del mentor: copia de solo
-- lectura de «Pagos» con historial, quién ve qué, sesiones sin repetidos,
-- periodo de cada sesión, sustituciones y comprobaciones de administración.
-- Todo ocurre dentro de una transacción que se deshace al final; no deja datos.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('M2',gen_random_uuid()),('P',gen_random_uuid()),
  ('S1',gen_random_uuid()),('S2',gen_random_uuid()),('C',gen_random_uuid()),('C2',gen_random_uuid());
grant select on ids to authenticated, service_role;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'A' then 'admin' when 'M' then 'mentor' when 'M2' then 'mentor' when 'P' then 'padre'
  when 'C' then 'coordinador' when 'C2' then 'coordinador' else 'alumno' end), jsonb_build_object('full_name', k || ' Prueba') from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
insert into student_mentors values (pg_temp.i('S1'),pg_temp.i('M')),(pg_temp.i('S2'),pg_temp.i('M2'));
insert into student_guardians(student_id,guardian_id) values (pg_temp.i('S1'),pg_temp.i('P'));
insert into kiru_coordinator_mentors(mentor_id,coordinator_id) values (pg_temp.i('M'),pg_temp.i('C')),(pg_temp.i('M2'),pg_temp.i('C2'));

create function pg_temp.as_user(k text) returns void language plpgsql as $$
declare u uuid := pg_temp.i(k);
begin
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','app_metadata',
    json_build_object('kiru_role',(select raw_app_meta_data->>'kiru_role' from auth.users where id=u)))::text, true);
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
create function pg_temp.expect_denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when insufficient_privilege or check_violation or raise_exception then
    raise notice 'ok  % (denied)', label; return;
  end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Registros: M con S1 el 7, 14, 15 (dos veces) y 21/10; M2 con S2 el 14/10; M sustituye a M2 con S2 el 16/10.
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers) values
  ('m-07', '2026-10-07 20:00+02', '2026-10-07', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[{"q":"¿Qué se ha trabajado hoy?","a":"Fracciones"}]'),
  ('m-14', '2026-10-14 20:00+02', '2026-10-14', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]'),
  ('m-15', '2026-10-15 20:00+02', '2026-10-15', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]'),
  ('m-15b','2026-11-04 18:00+01', '2026-10-15', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]'),
  ('m-21', '2026-10-21 20:00+02', '2026-10-21', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]'),
  ('m2-14','2026-10-14 20:00+02', '2026-10-14', 'M2','S2', pg_temp.i('M2'), pg_temp.i('S2'), '[]'),
  ('m-s2', '2026-10-16 20:00+02', '2026-10-16', 'M', 'S2', pg_temp.i('M'), pg_temp.i('S2'), '[]'),
  ('m-arch','2026-10-22 20:00+02','2026-10-22', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]');
update kiru_session_logs set manual_status = 'archivado' where source_key = 'm-arch';
-- Clase de S2 el 16/10 prevista con M2 (la dio M: sustitución).
insert into kiru_class_sessions(student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery)
values (pg_temp.i('S2'), pg_temp.i('M2'), 'regular', '2026-10-16 17:00+02', '2026-10-16 17:00+02', '2026-10-16 18:00+02', 'impartida');

-- 1. Copia de «Pagos» (la hace el servidor) --------------------------------------------
set local role service_role;
select pg_temp.expect('la hoja se copia', (kiru_mentor_payouts_sync(jsonb_build_array(
  jsonb_build_object('key','m|s1|2026-10-01','row',2,'mentor_name','M','student_name','S1','mentor_id',pg_temp.i('M'),'student_id',pg_temp.i('S1'),
    'start','2026-10-01','end','2026-10-19','status','Pagado','sessions',3,'extra_cents',0,'amount_cents',5400,'paid_on','2026-11-01'),
  jsonb_build_object('key','m|s1|2026-10-19','row',3,'mentor_name','M','student_name','S1','mentor_id',pg_temp.i('M'),'student_id',pg_temp.i('S1'),
    'start','2026-10-19','end','2026-11-19','status','Pendiente','sessions',1,'extra_cents',1000,'amount_cents',2800),
  jsonb_build_object('key','m2|s2|2026-10-01','row',4,'mentor_name','M2','student_name','S2','mentor_id',pg_temp.i('M2'),'student_id',pg_temp.i('S2'),
    'start','2026-10-01','end','2026-11-01','status','Pendiente','sessions',1,'extra_cents',1000,'amount_cents',2800),
  jsonb_build_object('key','m|s2|2026-10-16','row',5,'mentor_name','M','student_name','S2','mentor_id',pg_temp.i('M'),'student_id',pg_temp.i('S2'),
    'start','2026-10-16','end','2026-10-17','status','Pagado','sessions',1,'extra_cents',0,'amount_cents',1800,'paid_on','2026-10-31'),
  jsonb_build_object('key','aritz|s1|2026-09-01','row',6,'mentor_name','Aritz','student_name','S1','student_id',pg_temp.i('S1'),
    'start','2026-09-01','end','2026-10-01','status','Pagado','sessions',3,'amount_cents',4500),
  jsonb_build_object('key','m|s1|2026-10-01','row',7,'mentor_name','M','student_name','S1','start','2026-10-01','end','2026-10-19','status','Repetida')
)) ->> 'saved')::int, 5);
reset role;

-- 2. Quién ve qué --------------------------------------------------------------------
select pg_temp.as_user('M');
select pg_temp.expect('el mentor ve solo sus filas', (select count(*) from kiru_mentor_payouts), 3);
select pg_temp.expect('la fila repetida de la hoja no pisa la primera', (select amount_cents from kiru_mentor_payouts where sheet_key = 'm|s1|2026-10-01'), 5400);
select pg_temp.expect_denied('el mentor no cambia un pago', $$update kiru_mentor_payouts set amount_cents = 1 where true$$);
select pg_temp.expect_denied('el mentor no crea pagos', $$insert into kiru_mentor_payouts(sheet_key,mentor_name,student_name,period_start,period_end) values ('x','a','b','2026-01-01','2026-02-01')$$);
select pg_temp.expect_denied('el mentor no puede sincronizar', $$select kiru_mentor_payouts_sync('[]'::jsonb)$$);
select pg_temp.expect('el mentor no ve el historial', (select count(*) from kiru_mentor_payout_history), 0);
reset role;
select pg_temp.as_user('M2');
select pg_temp.expect('el otro mentor solo ve la suya', (select count(*) from kiru_mentor_payouts), 1);
reset role;
select pg_temp.as_user('C');
select pg_temp.expect('coordinación no ve pagos', (select count(*) from kiru_mentor_payouts), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('la familia no ve pagos', (select count(*) from kiru_mentor_payouts), 0);
reset role;
select pg_temp.as_user('A');
select pg_temp.expect('administración ve todo', (select count(*) from kiru_mentor_payouts), 5);
reset role;

-- 3. Cambios con historial; filas retiradas se conservan ------------------------------------
set local role service_role;
select kiru_mentor_payouts_sync(jsonb_build_array(
  jsonb_build_object('key','m|s1|2026-10-01','mentor_name','M','student_name','S1','mentor_id',pg_temp.i('M'),'student_id',pg_temp.i('S1'),
    'start','2026-10-01','end','2026-10-19','status','Pagado','sessions',3,'amount_cents',5400,'paid_on','2026-11-01'),
  jsonb_build_object('key','m|s1|2026-10-19','mentor_name','M','student_name','S1','mentor_id',pg_temp.i('M'),'student_id',pg_temp.i('S1'),
    'start','2026-10-19','end','2026-11-19','status','Pagado','sessions',1,'extra_cents',1000,'amount_cents',2800,'paid_on','2026-11-19'),
  jsonb_build_object('key','m2|s2|2026-10-01','mentor_name','M2','student_name','S2','mentor_id',pg_temp.i('M2'),'student_id',pg_temp.i('S2'),
    'start','2026-10-01','end','2026-11-01','status','Pendiente','sessions',1,'extra_cents',1000,'amount_cents',2800),
  jsonb_build_object('key','aritz|s1|2026-09-01','mentor_name','Aritz','student_name','S1','student_id',pg_temp.i('S1'),
    'start','2026-09-01','end','2026-10-01','status','Pagado','sessions',3,'amount_cents',4500)));
select pg_temp.expect('vaciar la hoja por error no retira nada', (kiru_mentor_payouts_sync('[]'::jsonb) ->> 'removed')::int, 0);
reset role;
select pg_temp.expect('el cambio de estado queda en el historial', (select count(*) from kiru_mentor_payout_history h join kiru_mentor_payouts p on p.id = h.payout_id
  where p.sheet_key = 'm|s1|2026-10-19' and h.previous ->> 'sheet_status' = 'Pendiente' and h.current ->> 'sheet_status' = 'Pagado'), 1);
select pg_temp.expect('una sincronización igual no añade historial', (select count(*) from kiru_mentor_payout_history h join kiru_mentor_payouts p on p.id = h.payout_id
  where p.sheet_key = 'm|s1|2026-10-01'), 0);
select pg_temp.expect('la fila quitada de la hoja se conserva', (select count(*) from kiru_mentor_payouts where sheet_key = 'm|s2|2026-10-16' and removed_at is not null), 1);
select pg_temp.as_user('A');
select pg_temp.expect_denied('el historial no se modifica', $$delete from kiru_mentor_payout_history where true$$);
select pg_temp.expect('administración ve el historial', (select count(*) from kiru_mentor_payout_history), 2);
reset role;
select pg_temp.as_user('M');
select pg_temp.expect('el mentor ya no ve la fila retirada', (select count(*) from kiru_mentor_payouts), 2);
reset role;

-- 4. Sesiones del mentor ------------------------------------------------------------------
select pg_temp.as_user('M');
select pg_temp.expect('el mentor ve sus registros sin los archivados', (select count(*) from kiru_mentor_sessions()), 6);
select pg_temp.expect('el registro repetido del 15/10 se marca', (select count(*) from kiru_mentor_sessions() where duplicate_of is not null), 1);
select pg_temp.expect('el repetido es el enviado después', (select count(*) from kiru_mentor_sessions() s join kiru_session_logs l on l.id = s.log_id
  where s.duplicate_of is not null and l.source_key = 'm-15b'), 1);
select pg_temp.expect('cada sesión cae en su periodo de «Pagos»', (select count(*) from kiru_mentor_sessions() s join kiru_mentor_payouts p on p.id = s.payout_id
  where p.sheet_key = 'm|s1|2026-10-01'), 4);
select pg_temp.expect('el 21/10 va al periodo siguiente', (select count(*) from kiru_mentor_sessions() s join kiru_mentor_payouts p on p.id = s.payout_id
  where p.sheet_key = 'm|s1|2026-10-19'), 1);
select pg_temp.expect('la sustitución trae la clase prevista con otro mentor', (select count(*) from kiru_mentor_sessions()
  where class_mentor_id = pg_temp.i('M2') and class_start is not null), 1);
select pg_temp.expect_text('la familia del alumno', (select family from kiru_mentor_sessions() where session_date = '2026-10-07'), 'P Prueba');
select pg_temp.expect_denied('un mentor no ve las sesiones de otro', format('select * from kiru_mentor_sessions(%L)', pg_temp.i('M2')));
select pg_temp.expect_denied('el mentor no ve las comprobaciones', $$select kiru_mentor_payout_checks()$$);
reset role;
select pg_temp.as_user('C');
select pg_temp.expect('el coordinador ve las de su mentor', (select count(*) from kiru_mentor_sessions(pg_temp.i('M'))), 6);
select pg_temp.expect_denied('pero no las de otro grupo', format('select * from kiru_mentor_sessions(%L)', pg_temp.i('M2')));
reset role;
select pg_temp.as_user('P');
select pg_temp.expect_denied('la familia no ve sesiones de mentores', format('select * from kiru_mentor_sessions(%L)', pg_temp.i('M')));
reset role;

-- 5. Comprobaciones de administración -----------------------------------------------------------
select pg_temp.as_user('A');
-- M|S1 01/10–19/10: la hoja dice 3 y el campus cuenta 3 días distintos (7, 14 y 15): cuadra.
-- M2|S2 01/10–01/11: la hoja dice 1 y el campus 1: cuadra. Ninguna diferencia.
select pg_temp.expect('sin diferencias cuando cuadra', jsonb_array_length(kiru_mentor_payout_checks() -> 'mismatches'), 0);
select pg_temp.expect('avisa de nombres sin cuenta', jsonb_array_length(kiru_mentor_payout_checks() -> 'unmatched'), 1);
reset role;
set local role service_role;
select kiru_mentor_payouts_sync(jsonb_build_array(
  jsonb_build_object('key','m|s1|2026-10-01','mentor_name','M','student_name','S1','mentor_id',pg_temp.i('M'),'student_id',pg_temp.i('S1'),
    'start','2026-10-01','end','2026-10-19','status','Pagado','sessions',4,'amount_cents',7200,'paid_on','2026-11-01'),
  jsonb_build_object('key','m|s1|2026-10-15','mentor_name','M','student_name','S1','mentor_id',pg_temp.i('M'),'student_id',pg_temp.i('S1'),
    'start','2026-10-15','end','2026-10-20','status','Pendiente','sessions',1,'amount_cents',1800)));
reset role;
select pg_temp.as_user('A');
select pg_temp.expect('avisa si la hoja cuenta distinto', jsonb_array_length(kiru_mentor_payout_checks() -> 'mismatches'), 1);
select pg_temp.expect('avisa de periodos que se pisan', jsonb_array_length(kiru_mentor_payout_checks() -> 'overlaps'), 1);
reset role;

rollback;
