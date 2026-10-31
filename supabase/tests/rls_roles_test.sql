-- Pruebas de aislamiento entre roles. Todo ocurre dentro de una transacción
-- que se deshace al final; no deja datos.
\set ON_ERROR_STOP 1
begin;
-- ids
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('M2',gen_random_uuid()),('P',gen_random_uuid()),('S1',gen_random_uuid()),('S2',gen_random_uuid()),('S3',gen_random_uuid()),('X',gen_random_uuid()),('F',gen_random_uuid()),('MN',gen_random_uuid()),('C',gen_random_uuid()),('C2',gen_random_uuid()),('M3',gen_random_uuid()),('M4',gen_random_uuid()),('M5',gen_random_uuid()),('M6',gen_random_uuid()),('M7',gen_random_uuid());
grant select on ids to authenticated;
insert into auth.users(id,email,raw_app_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k when 'A' then 'admin' when 'X' then 'admin' when 'M' then 'mentor' when 'M2' then 'mentor' when 'P' then 'padre' when 'F' then 'formador' when 'MN' then 'mentor' when 'C' then 'coordinador' when 'C2' then 'coordinador' when 'M3' then 'mentor' when 'M4' then 'mentor' when 'M5' then 'mentor' when 'M6' then 'mentor' when 'M7' then 'mentor' else 'alumno' end) from ids;
update profiles set is_active=false where id=(select id from ids where k='S3');
insert into student_mentors values ((select id from ids where k='S1'),(select id from ids where k='M')),((select id from ids where k='S2'),(select id from ids where k='M2'));
insert into student_guardians(student_id,guardian_id) values ((select id from ids where k='S1'),(select id from ids where k='P'));
insert into kiru_payments(student_id,concept,amount_cents,created_by) select id,'cuota',100,(select id from ids where k='A') from ids where k in ('S1','S2','S3');
insert into kiru_notices(title,content,created_by,target_student_id) values ('global','x',(select id from ids where k='A'),null),('s1','x',(select id from ids where k='A'),(select id from ids where k='S1')),('s2','x',(select id from ids where k='A'),(select id from ids where k='S2'));
insert into kiru_app_records(owner_id,record_type,record_key,created_by) select id,'progress','p_'||k,id from ids where k in ('S1','S2','S3');
insert into kiru_flashcard_sets(student_id,created_by,title) select id,(select id from ids where k='A'),'set' from ids where k in ('S1','S2');
insert into kiru_flashcards(set_id,term,definition) select id,'t','d' from kiru_flashcard_sets;

insert into kiru_mentor_onboarding(full_name,email,profile_id) values ('Mentor nuevo','mn@t.es',(select id from ids where k='MN'));
insert into kiru_coordinator_mentors(mentor_id,coordinator_id) values ((select id from ids where k='M'),(select id from ids where k='C')),((select id from ids where k='M2'),(select id from ids where k='C2'));
insert into kiru_session_logs(source_key,submitted_at,session_date,mentor_name,student_name,mentor_id,student_id,incident) values
  ('log-m',now(),current_date,'M','S1',(select id from ids where k='M'),(select id from ids where k='S1'),'Se distrae'),
  ('log-m2',now(),current_date,'M2','S2',(select id from ids where k='M2'),(select id from ids where k='S2'),'');
create temp table log_ids as select source_key, id from kiru_session_logs;
grant select on log_ids to authenticated;

create function pg_temp.as_user(k text, claim_role text default null) returns void language plpgsql as $$
declare u uuid; r text;
begin
  select id into u from ids where ids.k = as_user.k;
  r := coalesce(claim_role, (select raw_app_meta_data->>'kiru_role' from auth.users where id=u));
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','app_metadata',json_build_object('kiru_role',r))::text, true);
  set local role authenticated;
end $$;
create function pg_temp.expect(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok  %', label;
end $$;
create function pg_temp.expect_denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when insufficient_privilege or check_violation or unique_violation then raise notice 'ok  % (denied)', label; return; end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
create function pg_temp.expect_allowed(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; raise notice 'ok  % (allowed)', label; end $$;
grant execute on all functions in schema pg_temp to authenticated;
-- admin
select pg_temp.as_user('A');
select pg_temp.expect('admin ve 17 perfiles', (select count(*) from profiles), 17);
select pg_temp.expect('admin ve 3 pagos', (select count(*) from kiru_payments), 3);
select pg_temp.expect('admin ve 3 avisos', (select count(*) from kiru_notices), 3);
reset role;
-- mentor M
select pg_temp.as_user('M');
select pg_temp.expect('mentor ve su perfil + S1', (select count(*) from profiles), 2);
select pg_temp.expect('mentor no ve pagos', (select count(*) from kiru_payments), 0);
select pg_temp.expect('mentor ve aviso global + S1', (select count(*) from kiru_notices), 2);
select pg_temp.expect('mentor ve registros de S1', (select count(*) from kiru_app_records), 1);
select pg_temp.expect('mentor ve tarjetas de S1', (select count(*) from kiru_flashcards), 1);
select pg_temp.expect_allowed('mentor da SkillCoins a S1', format($q$insert into kiru_app_records(owner_id,record_type,record_key,created_by) values (%L,'progress','skillcoins_s1',%L)$q$, (select id from ids where k='S1'), (select id from ids where k='M')));
select pg_temp.expect_allowed('mentor guarda config propia', format($q$insert into kiru_app_records(owner_id,record_type,record_key,created_by) values (%L,'activity','subject_config_x',%L)$q$, (select id from ids where k='M'), (select id from ids where k='M')));
select pg_temp.expect_denied('mentor escribe a alumno ajeno', format($q$insert into kiru_app_records(owner_id,record_type,record_key,created_by) values (%L,'activity','a',%L)$q$, (select id from ids where k='S2'), (select id from ids where k='M')));
reset role;
-- padre P
select pg_temp.as_user('P');
select pg_temp.expect('padre ve su perfil + S1', (select count(*) from profiles), 2);
select pg_temp.expect('padre ve pago de S1', (select count(*) from kiru_payments), 1);
select pg_temp.expect('padre ve tarjetas de S1', (select count(*) from kiru_flashcards), 1);
reset role;
-- coordinador C (lleva a M, que tiene a S1, cuya familia es P)
select pg_temp.as_user('C');
select pg_temp.expect('coordinador nace como coordinador', (select count(*) from profiles where role='coordinador'), 1);
select pg_temp.expect('coordinador ve su perfil + M + S1 + P', (select count(*) from profiles), 4);
select pg_temp.expect('coordinador ve el alumno de su mentor', (select count(*) from students), 1);
select pg_temp.expect('coordinador ve la asignación de su mentor', (select count(*) from student_mentors), 1);
select pg_temp.expect('coordinador ve la familia del alumno', (select count(*) from student_guardians), 1);
select pg_temp.expect('coordinador ve progreso y SkillCoins de S1', (select count(*) from kiru_app_records), 2);
select pg_temp.expect('coordinador no ve pagos', (select count(*) from kiru_payments), 0);
select pg_temp.expect('coordinador ve su enlace', (select count(*) from kiru_coordinator_mentors), 1);
select pg_temp.expect('coordinador ve registros de sesión de su mentor', (select count(*) from kiru_session_logs), 1);
select pg_temp.expect_allowed('coordinador revisa incidencia de su mentor', format($q$insert into kiru_incident_reviews(log_id,note,reviewed_by) select id,'hablado',%L from kiru_session_logs where source_key='log-m'$q$, (select id from ids where k='C')));
select pg_temp.expect_denied('coordinador asigna alumno', format($q$insert into student_mentors values (%L,%L)$q$, (select id from ids where k='S3'), (select id from ids where k='M')));
select pg_temp.expect_denied('coordinador se asigna mentores', format($q$insert into kiru_coordinator_mentors(mentor_id,coordinator_id) values (%L,%L)$q$, (select id from ids where k='M3'), (select id from ids where k='C')));
select pg_temp.expect_denied('coordinador crea registro de sesión', format($q$insert into kiru_session_logs(source_key,submitted_at) values ('falso',now())$q$));
select pg_temp.expect_denied('coordinador escribe en registros del alumno', format($q$insert into kiru_app_records(owner_id,record_type,record_key,created_by) values (%L,'activity','x',%L)$q$, (select id from ids where k='S1'), (select id from ids where k='C')));
select pg_temp.expect_denied('coordinador revisa registro de otro mentor', format($q$insert into kiru_incident_reviews(log_id,note,reviewed_by) select id,'x',%L from log_ids where source_key='log-m2'$q$, (select id from ids where k='C')));
reset role;
select pg_temp.as_user('C2');
select pg_temp.expect('otro coordinador solo ve su mentor', (select count(*) from profiles where role='mentor'), 1);
select pg_temp.expect('otro coordinador no ve la revisión ajena', (select count(*) from kiru_incident_reviews), 0);
select pg_temp.expect('otro coordinador ve su registro de sesión', (select count(*) from kiru_session_logs), 1);
reset role;
select pg_temp.as_user('M');
select pg_temp.expect('mentor ve sus registros de sesión', (select count(*) from kiru_session_logs), 1);
select pg_temp.expect('mentor no ve notas del coordinador', (select count(*) from kiru_incident_reviews), 0);
select pg_temp.expect('mentor no ve enlaces de coordinación', (select count(*) from kiru_coordinator_mentors), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('padre no ve registros de sesión', (select count(*) from kiru_session_logs), 0);
reset role;
select pg_temp.as_user('C', 'admin');
select pg_temp.expect('JWT admin con perfil coordinador no ve pagos', (select count(*) from kiru_payments), 0);
reset role;
-- administración enlaza; máximo 5 mentores por coordinador
select pg_temp.as_user('A');
select pg_temp.expect_allowed('admin enlaza 4 mentores más a C2', format($q$insert into kiru_coordinator_mentors(mentor_id,coordinator_id) select id,%L from ids where k in ('M3','M4','M5','M6')$q$, (select id from ids where k='C2')));
select pg_temp.expect_denied('admin no pasa de 5 mentores', format($q$insert into kiru_coordinator_mentors(mentor_id,coordinator_id) values (%L,%L)$q$, (select id from ids where k='M7'), (select id from ids where k='C2')));
select pg_temp.expect_allowed('admin cambia un mentor de coordinador', format($q$update kiru_coordinator_mentors set coordinator_id=%L where mentor_id=%L$q$, (select id from ids where k='C'), (select id from ids where k='M6')));
select pg_temp.expect_allowed('con hueco libre ya se puede', format($q$insert into kiru_coordinator_mentors(mentor_id,coordinator_id) values (%L,%L)$q$, (select id from ids where k='M7'), (select id from ids where k='C2')));
select pg_temp.expect_denied('admin no pone a un mentor de coordinador', format($q$update kiru_coordinator_mentors set coordinator_id=%L where mentor_id=%L$q$, (select id from ids where k='M'), (select id from ids where k='M7')));
select pg_temp.expect('admin ve todos los registros de sesión', (select count(*) from kiru_session_logs), 2);
reset role;
-- alumno S1
select pg_temp.as_user('S1');
select pg_temp.expect('alumno ve su perfil', (select count(*) from profiles), 1);
select pg_temp.expect('alumno ve su pago', (select count(*) from kiru_payments), 1);
select pg_temp.expect('alumno ve aviso global + suyo', (select count(*) from kiru_notices), 2);
select pg_temp.expect_allowed('alumno guarda su progreso', format($q$insert into kiru_app_records(owner_id,record_type,record_key,created_by) values (%L,'progress','english_a1_attempt_1',%L)$q$, (select id from ids where k='S1'), (select id from ids where k='S1')));
select pg_temp.expect_allowed('alumno actualiza su progreso', format($q$update kiru_app_records set data='{"x":1}' where record_key='english_a1_attempt_1' and owner_id=%L$q$, (select id from ids where k='S1')));
select pg_temp.expect_denied('alumno falsea SkillCoins', format($q$insert into kiru_app_records(owner_id,record_type,record_key,created_by) values (%L,'progress','skillcoins_fake',%L)$q$, (select id from ids where k='S1'), (select id from ids where k='S1')));
select pg_temp.expect_denied('alumno crea actividad falsa', format($q$insert into kiru_app_records(owner_id,record_type,record_key,created_by) values (%L,'activity','fake',%L)$q$, (select id from ids where k='S1'), (select id from ids where k='S1')));
select pg_temp.expect_denied('alumno crea pago', format($q$insert into kiru_payments(student_id,concept,amount_cents,created_by) values (%L,'x',1,%L)$q$, (select id from ids where k='S1'), (select id from ids where k='S1')));
reset role;
-- alumno desactivado S3
select pg_temp.as_user('S3');
select pg_temp.expect('desactivado no ve su perfil', (select count(*) from profiles), 0);
select pg_temp.expect('desactivado no ve pagos', (select count(*) from kiru_payments), 0);
select pg_temp.expect('desactivado no ve avisos', (select count(*) from kiru_notices), 0);
select pg_temp.expect('desactivado no ve registros', (select count(*) from kiru_app_records), 0);
reset role;
-- X: perfil admin pero JWT dice mentor (desincronizado)
select pg_temp.as_user('X', 'mentor');
select pg_temp.expect('rol desincronizado no es admin', (select count(*) from kiru_payments), 0);
reset role;
-- alumno con JWT manipulado diciendo admin (no puede pasar: profile dice alumno)
select pg_temp.as_user('S2', 'admin');
select pg_temp.expect('JWT admin con perfil alumno no ve todo', (select count(*) from kiru_payments), 1);
reset role;
-- asignaciones desde el panel de administración (antes: recursión infinita)
select pg_temp.as_user('A');
select pg_temp.expect_allowed('admin asigna familia', format($q$insert into student_guardians(student_id,guardian_id) values (%L,%L)$q$, (select id from ids where k='S2'), (select id from ids where k='P')));
select pg_temp.expect_denied('admin no asigna alumno como familia', format($q$insert into student_guardians(student_id,guardian_id) values (%L,%L)$q$, (select id from ids where k='S2'), (select id from ids where k='S1')));
select pg_temp.expect_denied('admin no asigna padre como mentor', format($q$insert into student_mentors values (%L,%L)$q$, (select id from ids where k='S3'), (select id from ids where k='P')));
reset role;
-- formador F
select pg_temp.as_user('F');
select pg_temp.expect('formador nace como formador', (select count(*) from profiles where role='formador'), 1);
select pg_temp.expect('formador solo ve su perfil', (select count(*) from profiles), 1);
select pg_temp.expect('formador no ve alumnos', (select count(*) from students), 0);
select pg_temp.expect('formador no ve pagos', (select count(*) from kiru_payments), 0);
select pg_temp.expect('formador no ve registros', (select count(*) from kiru_app_records), 0);
select pg_temp.expect('formador no ve asignaciones', (select count(*) from student_mentors), 0);
select pg_temp.expect('formador ve fichas de incorporación', (select count(*) from kiru_mentor_onboarding), 1);
select pg_temp.expect_allowed('formador crea ficha', $q$insert into kiru_mentor_onboarding(full_name,email) values ('Otra','otra@t.es')$q$);
select pg_temp.expect_allowed('formador marca confidencialidad', $q$update kiru_mentor_onboarding set confidentiality_signed_at=now() where email='otra@t.es'$q$);
select pg_temp.expect_denied('formador asigna alumno', format($q$insert into student_mentors values (%L,%L)$q$, (select id from ids where k='S3'), (select id from ids where k='MN')));
select pg_temp.expect_denied('formador crea pago', format($q$insert into kiru_payments(student_id,concept,amount_cents,created_by) values (%L,'x',1,%L)$q$, (select id from ids where k='S1'), (select id from ids where k='F')));
do $$ begin delete from kiru_mentor_onboarding; end $$;
select pg_temp.expect('formador no borra fichas', (select count(*) from kiru_mentor_onboarding), 2);
reset role;
-- otros roles no ven fichas
select pg_temp.as_user('M');
select pg_temp.expect('mentor no ve fichas', (select count(*) from kiru_mentor_onboarding), 0);
reset role;
select pg_temp.as_user('S1');
select pg_temp.expect('alumno no ve fichas', (select count(*) from kiru_mentor_onboarding), 0);
reset role;
select pg_temp.as_user('F', 'admin');
select pg_temp.expect('JWT admin con perfil formador no ve pagos', (select count(*) from kiru_payments), 0);
reset role;
-- bloqueo de asignación sin certificado
select pg_temp.as_user('A');
select pg_temp.expect_denied('admin asigna mentor sin certificado', format($q$insert into student_mentors values (%L,%L)$q$, (select id from ids where k='S3'), (select id from ids where k='MN')));
select pg_temp.expect_denied('admin cambia a mentor sin certificado', format($q$update student_mentors set mentor_id=%L where student_id=%L$q$, (select id from ids where k='MN'), (select id from ids where k='S1')));
select pg_temp.expect_allowed('admin marca certificado', $q$update kiru_mentor_onboarding set certificate_checked_at=now() where email='mn@t.es'$q$);
select pg_temp.expect_allowed('admin asigna mentor con certificado', format($q$insert into student_mentors values (%L,%L)$q$, (select id from ids where k='S3'), (select id from ids where k='MN')));
select pg_temp.expect_allowed('mentor antiguo sin ficha sigue asignable', format($q$update student_mentors set mentor_id=%L where student_id=%L$q$, (select id from ids where k='M2'), (select id from ids where k='S1')));
reset role;
-- anon
set local role anon;
select pg_temp.expect('anon no ve perfiles', (select count(*) from profiles), 0);
select pg_temp.expect('anon no ve fichas', (select count(*) from kiru_mentor_onboarding), 0);
select pg_temp.expect_denied('anon no lee enlaces de acceso', $q$select 1 from kiru_access_links$q$);
select pg_temp.expect_denied('anon no crea peticiones de PIN', $q$insert into kiru_pin_requests(profile_id) values (gen_random_uuid())$q$);
reset role;
-- enlaces de acceso: solo el servidor (service role)
insert into kiru_access_links(profile_id,token_hash,expires_at) values ((select id from ids where k='MN'), repeat('a',64), now() + interval '14 days');
select pg_temp.as_user('A');
select pg_temp.expect_denied('admin no lee enlaces de acceso', $q$select 1 from kiru_access_links$q$);
reset role;
select pg_temp.as_user('MN');
select pg_temp.expect_denied('mentor no lee su enlace', $q$select 1 from kiru_access_links$q$);
select pg_temp.expect_denied('mentor no lee peticiones de PIN', $q$select 1 from kiru_pin_requests$q$);
select pg_temp.expect_denied('mentor no crea peticiones de PIN', format($q$insert into kiru_pin_requests(profile_id) values (%L)$q$, (select id from ids where k='MN')));
select pg_temp.expect_denied('mentor no crea enlaces', format($q$insert into kiru_access_links(profile_id,token_hash,expires_at) values (%L,%L,now())$q$, (select id from ids where k='MN'), repeat('b',64)));
reset role;
-- propuestas de alumno: el mentor nunca lee la tabla (ni código ni nombre del alumno)
insert into kiru_assignment_offers(offer_code,mentor_email,mentor_id,student_label) values
  ('OF-0123456789abcdef0123','m@t.es',(select id from ids where k='M'),'Alumno Uno'),
  ('OF-0123456789abcdef0123','m2@t.es',(select id from ids where k='M2'),'Alumno Uno');
insert into kiru_assignment_offer_events(offer_id,action) select id,'recibida' from kiru_assignment_offers;
select pg_temp.expect_denied('código de oferta con nombre del alumno', $q$insert into kiru_assignment_offers(offer_code,mentor_email) values ('match|alumno uno|123','x@t.es')$q$);
select pg_temp.expect_denied('dos seleccionados para el mismo alumno', $q$update kiru_assignment_offers set decision='seleccionado', decided_at=now()$q$);
select pg_temp.as_user('A');
select pg_temp.expect('admin ve 2 propuestas', (select count(*) from kiru_assignment_offers), 2);
select pg_temp.expect('admin ve 2 eventos', (select count(*) from kiru_assignment_offer_events), 2);
select pg_temp.expect_denied('admin no escribe propuestas desde el navegador', $q$update kiru_assignment_offers set decision='no_seleccionado', decided_at=now()$q$);
reset role;
select pg_temp.as_user('M');
select pg_temp.expect('mentor no lee propuestas directamente', (select count(*) from kiru_assignment_offers), 0);
select pg_temp.expect('mentor no lee historial', (select count(*) from kiru_assignment_offer_events), 0);
select pg_temp.expect_denied('mentor no responde desde el navegador', $q$update kiru_assignment_offers set response='si', responded_at=now()$q$);
reset role;
select pg_temp.as_user('C');
select pg_temp.expect('coordinador ve solo la propuesta de su mentor', (select count(*) from kiru_assignment_offers), 1);
select pg_temp.expect('coordinador ve solo su historial', (select count(*) from kiru_assignment_offer_events), 1);
reset role;
select pg_temp.as_user('F');
select pg_temp.expect('formador no ve propuestas', (select count(*) from kiru_assignment_offers), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('padre no ve propuestas', (select count(*) from kiru_assignment_offers), 0);
reset role;
-- semanas sin SC: S1 (mentor M) tuvo clase la semana pasada sin SkillCoins; S2 (M2) sí las tiene
insert into kiru_session_logs(source_key,submitted_at,session_date,mentor_name,student_name,mentor_id,student_id,answers) values
  ('sc-s1',now(),date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date - 5,'M','S1',(select id from ids where k='M'),(select id from ids where k='S1'),'[]'),
  ('sc-s2',now(),date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date - 5,'M2','S2',(select id from ids where k='M2'),(select id from ids where k='S2'),
   '[{"q":"SKILLCOINS: estudios (0-10)","a":"7"},{"q":"SKILLCOINS: compromiso(0-10)","a":"6"},{"q":"SKILLCOINS: organización(0-10)","a":"5"},{"q":"SKILLCOINS: bienestar(0-10)","a":"8"}]');
select pg_temp.as_user('A');
select pg_temp.expect('admin ve semanas sin SC', (select count(*) from kiru_missing_sc_weeks()), 1);
reset role;
select pg_temp.as_user('M');
select pg_temp.expect('mentor ve su semana sin SC', (select count(*) from kiru_missing_sc_weeks()), 1);
reset role;
select pg_temp.as_user('M2');
select pg_temp.expect('mentor con SC no tiene aviso', (select count(*) from kiru_missing_sc_weeks()), 0);
reset role;
select pg_temp.as_user('C');
select pg_temp.expect('coordinador ve la semana sin SC de su mentor', (select count(*) from kiru_missing_sc_weeks()), 1);
reset role;
select pg_temp.as_user('C2');
select pg_temp.expect('otro coordinador no la ve', (select count(*) from kiru_missing_sc_weeks()), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('padre no ve semanas sin SC', (select count(*) from kiru_missing_sc_weeks()), 0);
reset role;
set local role anon;
select pg_temp.expect_denied('anon no ve semanas sin SC', $q$select * from kiru_missing_sc_weeks()$q$);
reset role;

-- Renovaciones: correo y campus comparten respuesta; vale la primera.
update profiles set full_name = 'Álvaro Vara' where id = (select id from ids where k='S1');
set local role service_role;
select pg_temp.expect('script sin cuenta no publica', (select (kiru_renewal_publish('{"email":"nadie@t","alumno":"Álvaro","fin":"2026-11-19","mantener_etiqueta":"Mantener 2 días por semana","mantener_precio":250}')->>'found')::boolean::int), 0);
select pg_temp.expect('script publica la renovación', (select (kiru_renewal_publish('{"email":"P@T","alumno":"alvaro","fin":"2026-11-19","mantener_etiqueta":"Mantener 2 días por semana","mantener_precio":250,"subir_etiqueta":"Pasar a 3 días por semana","subir_precio":500}')->>'found')::boolean::int), 1);
select pg_temp.expect('publicar dos veces no duplica', (select (kiru_renewal_publish('{"email":"P@t","alumno":"Álvaro","fin":"2026-11-19","mantener_etiqueta":"Mantener 2 días por semana","mantener_precio":250,"subir_etiqueta":"Pasar a 3 días por semana","subir_precio":500}')->>'found')::boolean::int), 1);
select pg_temp.expect('una sola renovación', (select count(*) from kiru_renewals), 1);
select pg_temp.expect('un solo aviso en la campanita', (select count(*) from kiru_notifications where kind='renovacion'), 1);
reset role;
create temp table ren as select id from kiru_renewals;
grant select on ren to authenticated;
select pg_temp.as_user('M');
select pg_temp.expect('mentor no ve renovaciones', (select count(*) from kiru_renewals), 0);
select pg_temp.expect_denied('mentor no elige plan', $q$select kiru_renewal_choose((select id from ren), 'mantener')$q$);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('padre ve su renovación', (select count(*) from kiru_renewals), 1);
select pg_temp.expect_denied('padre no escribe directo', $q$update kiru_renewals set plan='mantener'$q$);
select pg_temp.expect_denied('padre no usa la función del script', $q$select kiru_renewal_from_email('P@t','Álvaro','2026-11-19','mantener')$q$);
select pg_temp.expect('padre elige un día más en el campus', (select (kiru_renewal_choose((select id from ren), 'subir')->>'already')::boolean::int), 0);
select pg_temp.expect('segunda pulsación no cambia nada', (select (kiru_renewal_choose((select id from ren), 'no_renueva')->>'already')::boolean::int), 1);
select pg_temp.expect('plan sigue siendo subir', (select count(*) from kiru_renewals where plan='subir' and plan_source='campus'), 1);
reset role;
set local role service_role;
select pg_temp.expect('el correo ve que ya eligió', (select (kiru_renewal_from_email('p@t','Álvaro','2026-11-19','mantener')->>'already')::boolean::int), 1);
select pg_temp.expect('el correo devuelve lo del campus', (select count(*) from kiru_renewals where plan='subir'), 1);
select pg_temp.expect('pago por correo', (select (kiru_renewal_from_email('p@t','Álvaro','2026-11-19','pagado')->>'already')::boolean::int), 0);
select pg_temp.expect('hoja tiene 1 pendiente', (select jsonb_array_length(kiru_renewal_sync('[]')->'pendientes')), 1);
select pg_temp.expect('ack confirma', (select kiru_renewal_ack((select jsonb_agg(jsonb_build_object('id',x->>'id','seq',x->'seq')) from jsonb_array_elements(kiru_renewal_sync('[]')->'pendientes') x))), 1);
select pg_temp.expect('hoja sin pendientes', (select jsonb_array_length(kiru_renewal_sync('[]')->'pendientes')), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('he pagado tras el correo no repite', (select (kiru_renewal_report_paid((select id from ren))->>'already')::boolean::int), 1);
reset role;
set local role service_role;
select pg_temp.expect('fecha nueva en la hoja cierra el periodo', (select jsonb_array_length(kiru_renewal_sync('[{"email":"P@t","alumno":"Álvaro","fin":"2026-12-19"}]')->'pendientes')), 0);
select pg_temp.expect('periodo cerrado', (select count(*) from kiru_renewals where closed_at is not null), 1);
select pg_temp.expect('publicar con lo ya elegido en la hoja', (select (kiru_renewal_publish('{"email":"P@t","alumno":"Álvaro","fin":"2026-12-19","mantener_etiqueta":"Mantener 2 días por semana","mantener_precio":250,"plan":"mantener","pagado":true}')->>'already')::boolean::int), 0);
select pg_temp.expect('lo de la hoja queda como respondido por correo', (select count(*) from kiru_renewals where period_end='2026-12-19' and plan='mantener' and plan_source='correo' and paid_source='correo'), 1);
select pg_temp.expect('y no queda pendiente para la hoja', (select jsonb_array_length(kiru_renewal_sync('[]')->'pendientes')), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('cerrado no admite respuesta', (select (kiru_renewal_report_paid((select id from ren))->>'already')::boolean::int), 1);
reset role;
-- Mensualidad siempre visible y pago por adelantado.
set local role service_role;
select pg_temp.expect('sincronizar con datos crea la mensualidad sin campanita', (select jsonb_array_length(kiru_renewal_sync('[{"email":"P@t","alumno":"Álvaro","fin":"2027-01-19","datos":{"email":"P@t","alumno":"Álvaro","fin":"2027-01-19","mantener_etiqueta":"Mantener 2 días por semana","mantener_precio":350,"subir_etiqueta":"Pasar a 3 días por semana","subir_precio":500,"adelantado":{"mantener":[{"meses":3,"total":997.5,"ahorro":52.5,"pct":5},{"meses":"x","total":1}],"subir":[{"meses":3,"total":1425,"ahorro":75,"pct":5}]}}}]')->'pendientes')), 0);
select pg_temp.expect('periodo anterior cerrado y uno nuevo abierto', (select count(*) from kiru_renewals where period_end='2027-01-19' and closed_at is null and jsonb_array_length(prepay->'mantener')=1), 1);
select pg_temp.expect('sin aviso en la campanita', (select count(*) from kiru_notifications where kind='renovacion'), 2);
reset role;
create temp table ren2 as select id from kiru_renewals where period_end='2027-01-19';
grant select on ren2 to authenticated;
select pg_temp.as_user('P');
do $$ begin
  perform kiru_renewal_choose((select id from ren2), 'mantener', 6);
  raise exception 'FAIL meses no ofrecidos: allowed';
exception when invalid_parameter_value then raise notice 'ok  meses no ofrecidos (denied)';
end $$;
select pg_temp.expect('padre paga 3 meses por adelantado', (select (kiru_renewal_choose((select id from ren2), 'mantener', 3)->>'total')::numeric * 10)::bigint, 9975);
reset role;
set local role service_role;
select pg_temp.expect('la hoja recibe meses y total', (select count(*) from jsonb_array_elements(kiru_renewal_sync('[]')->'pendientes') x where (x->>'meses')::int=3 and (x->>'total')::numeric=997.5), 1);
select pg_temp.expect('sincronizar otra vez no cambia lo elegido', (select jsonb_array_length(kiru_renewal_sync('[{"email":"P@t","alumno":"Álvaro","fin":"2027-01-19","datos":{"email":"P@t","alumno":"Álvaro","fin":"2027-01-19","mantener_etiqueta":"Mantener 2 días por semana","mantener_precio":400,"adelantado":{}}}]')->'pendientes')), 1);
select pg_temp.expect('precio y meses se mantienen', (select count(*) from kiru_renewals where period_end='2027-01-19' and months=3 and keep_price=350 and prepay ? 'mantener'), 1);
select pg_temp.expect('el correo ve el pago adelantado', (select (kiru_renewal_from_email('p@t','Álvaro','2027-01-19','subir',3)->>'meses')::int), 3);
reset role;
set local role anon;
select pg_temp.expect_denied('anon no ve renovaciones', $q$select * from kiru_renewals$q$);
reset role;
rollback;
