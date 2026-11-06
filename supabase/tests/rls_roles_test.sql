-- Pruebas de aislamiento entre roles. Todo ocurre dentro de una transacción
-- que se deshace al final; no deja datos.
\set ON_ERROR_STOP 1
begin;
-- ids
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('M2',gen_random_uuid()),('P',gen_random_uuid()),('S1',gen_random_uuid()),('S2',gen_random_uuid()),('S3',gen_random_uuid()),('X',gen_random_uuid()),('F',gen_random_uuid()),('MN',gen_random_uuid()),('C',gen_random_uuid()),('C2',gen_random_uuid()),('M3',gen_random_uuid()),('M4',gen_random_uuid()),('M5',gen_random_uuid()),('M6',gen_random_uuid()),('M7',gen_random_uuid());
grant select on ids to authenticated;
-- El fixture de duplicados inserta una segunda respuesta como service_role.
-- Dale acceso únicamente a la tabla temporal de IDs usada por estas pruebas.
grant select on ids to service_role;
insert into auth.users(id,email,raw_app_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k when 'A' then 'admin' when 'X' then 'admin' when 'M' then 'mentor' when 'M2' then 'mentor' when 'P' then 'padre' when 'F' then 'formador' when 'MN' then 'mentor' when 'C' then 'coordinador' when 'C2' then 'coordinador' when 'M3' then 'mentor' when 'M4' then 'mentor' when 'M5' then 'mentor' when 'M6' then 'mentor' when 'M7' then 'mentor' else 'alumno' end) from ids;
update profiles set is_active=false where id=(select id from ids where k='S3');
insert into student_mentors values ((select id from ids where k='S1'),(select id from ids where k='M')),((select id from ids where k='S2'),(select id from ids where k='M2'));
insert into student_guardians(student_id,guardian_id) values ((select id from ids where k='S1'),(select id from ids where k='P'));
insert into kiru_student_schedule_slots(student_id,mentor_id,weekday,start_time,end_time) values
  ((select id from ids where k='S1'),(select id from ids where k='M'),1,'18:00','19:00'),
  ((select id from ids where k='S1'),(select id from ids where k='M'),3,'18:00','19:00'),
  ((select id from ids where k='S2'),(select id from ids where k='M2'),2,'17:00','18:00');
insert into kiru_payments(student_id,concept,amount_cents,created_by) select id,'cuota',100,(select id from ids where k='A') from ids where k in ('S1','S2','S3');
insert into kiru_notices(title,content,created_by,target_student_id) values ('global','x',(select id from ids where k='A'),null),('s1','x',(select id from ids where k='A'),(select id from ids where k='S1')),('s2','x',(select id from ids where k='A'),(select id from ids where k='S2'));
insert into kiru_app_records(owner_id,record_type,record_key,created_by) select id,'progress','p_'||k,id from ids where k in ('S1','S2','S3');
insert into kiru_flashcard_sets(student_id,created_by,title) select id,(select id from ids where k='A'),'set' from ids where k in ('S1','S2');
insert into kiru_flashcards(set_id,term,definition) select id,'t','d' from kiru_flashcard_sets;

insert into kiru_mentor_onboarding(full_name,email,profile_id) values ('Mentor nuevo','mn@t.es',(select id from ids where k='MN'));
insert into kiru_coordinator_mentors(mentor_id,coordinator_id) values ((select id from ids where k='M'),(select id from ids where k='C')),((select id from ids where k='M2'),(select id from ids where k='C2'));
insert into kiru_session_logs(source_key,submitted_at,session_date,mentor_name,student_name,mentor_id,student_id,incident,answers) values
  ('log-m',now(),date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date + 3 - CASE WHEN extract(isodow FROM now() AT TIME ZONE 'Europe/Madrid') < 4 THEN 7 ELSE 0 END,'M','S1',(select id from ids where k='M'),(select id from ids where k='S1'),'Se distrae','[{"q":"¿Qué número de sesión del mes?","a":"3º"},{"q":"¿Qué se ha trabajado hoy?","a":"Fracciones y problemas"}]'::jsonb),
  ('log-m2',now(),date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date + 3 - CASE WHEN extract(isodow FROM now() AT TIME ZONE 'Europe/Madrid') < 4 THEN 7 ELSE 0 END,'M2','S2',(select id from ids where k='M2'),(select id from ids where k='S2'),'','[]'::jsonb);
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
select pg_temp.as_user('M');
select pg_temp.expect('mentor ve aviso cuando registra fuera de sus días acordados', (
  select count(*) from kiru_session_schedule_mismatches(90)
  where student_id=(select id from ids where k='S1')
    and mentor_id=(select id from ids where k='M')
    and session_weekday=4 and scheduled_weekdays=array[1,3]::smallint[]
), 1);
reset role;
select pg_temp.as_user('C');
select pg_temp.expect('coordinación ve la fecha fuera de horario de su mentor', (
  select count(*) from kiru_session_schedule_mismatches(90)
  where student_id=(select id from ids where k='S1') and mentor_id=(select id from ids where k='M')
), 1);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('padre no ve alertas internas de horario', (select count(*) from kiru_session_schedule_mismatches(90)), 0);
reset role;
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
select pg_temp.expect('padre no ve registros completos de sesión', (select count(*) from kiru_session_logs), 0);
select pg_temp.expect('padre ve el historial de su hijo', (select count(*) from kiru_family_session_history), 1);
select pg_temp.expect('padre ve el tema registrado de su hijo', (select count(*) from kiru_family_session_history where topic='Fracciones y problemas'), 1);
select pg_temp.expect('padre no ve el historial de otro alumno', (select count(*) from kiru_family_session_history where student_id=(select id from ids where k='S2')), 0);
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
-- Una respuesta duplicada con la misma fecha y número no debe duplicar el
-- historial familiar; el original queda primero y se conserva en la tabla.
set local role service_role;
insert into kiru_session_logs(source_key,submitted_at,session_date,mentor_name,student_name,mentor_id,student_id,answers) values
  ('log-m-duplicate',now() + interval '1 hour',current_date,'M','S1',(select id from ids where k='M'),(select id from ids where k='S1'),
   '[{"q":"¿Qué número de sesión del mes?","a":"3º"},{"q":"¿Qué se ha trabajado hoy?","a":"Duplicado"}]');
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('padre no ve duplicada una sesión registrada dos veces', (select count(*) from kiru_family_session_history where student_id=(select id from ids where k='S1') and session_date=current_date), 1);
reset role;
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

-- Horarios semanales: familia y mentor solo ven las franjas de su relación.
select pg_temp.as_user('P');
select pg_temp.expect('padre ve las dos franjas de S1', (select count(*) from kiru_student_schedule_slots where student_id=(select id from ids where k='S1')), 2);
select pg_temp.expect('padre ve solo los horarios de sus hijos vinculados', (select count(*) from kiru_student_schedule_slots where student_id=(select id from ids where k='S3')), 0);
reset role;
select pg_temp.as_user('M');
select pg_temp.expect('mentor ve las dos franjas de su alumno asignado', (select count(*) from kiru_student_schedule_slots), 2);
reset role;
select pg_temp.as_user('M2');
select pg_temp.expect('otro mentor solo ve su alumno asignado', (select count(*) from kiru_student_schedule_slots), 1);
reset role;
set local role anon;
select pg_temp.expect_denied('anon no ve horarios', $q$select * from kiru_student_schedule_slots$q$);
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
  perform kiru_renewal_choose_months((select id from ren2), 'mantener', 6);
  raise exception 'FAIL meses no ofrecidos: allowed';
exception when invalid_parameter_value then raise notice 'ok  meses no ofrecidos (denied)';
end $$;
select pg_temp.expect('padre paga 3 meses por adelantado', (select (kiru_renewal_choose_months((select id from ren2), 'mantener', 3)->>'total')::numeric * 10)::bigint, 9975);
select pg_temp.expect('padre reporta pago de 3 meses', (select (kiru_renewal_report_paid((select id from ren2))->>'already')::boolean::int), 0);
select pg_temp.expect('pago conectado a su renovación', (select count(*) from kiru_payments where renewal_id=(select id from ren2)), 1);
select pg_temp.expect('pago conserva los 2 días de frecuencia', (select count(*) from kiru_payments where renewal_id=(select id from ren2) and days_per_week=2), 1);
select pg_temp.expect('pago incluye las ocurrencias reales del horario del periodo', (
  select count(*) from kiru_payments p
  where p.renewal_id=(select id from ren2)
    and p.sessions_included=(
      select count(*) from kiru_student_schedule_slots s
      cross join lateral generate_series(p.coverage_start::timestamp, (p.coverage_end - 1)::timestamp, interval '1 day') AS scheduled_day(day)
      where s.student_id=p.student_id and s.is_active
        and extract(isodow from scheduled_day.day)::smallint=s.weekday
    )
), 1);
-- Este bloque prepara y restaura datos del fixture; no forma parte de una
-- operación permitida al padre en producción.
reset role;
do $$
declare
  v_previous_paid_at timestamptz;
  v_renewal_id uuid := (select id from ren2);
begin
  select paid_reported_at into v_previous_paid_at from kiru_renewals where id=v_renewal_id;
  update kiru_renewals
    set paid_reported_at='2026-10-19 12:00:00+02'::timestamptz, months=1
    where id=v_renewal_id;
  if not exists (
    select 1 from kiru_payments
    where renewal_id=v_renewal_id and coverage_start='2026-10-19'
      and coverage_end='2026-11-19' and sessions_included=10
  ) then
    raise exception 'FAIL: periodo 19/10–19/11 con lunes y miércoles debe incluir 10 sesiones';
  end if;
  update kiru_renewals set paid_reported_at=v_previous_paid_at, months=3 where id=v_renewal_id;
  raise notice 'ok  periodo del 19/10 al 19/11 incluye las 10 clases lunes/miércoles';
end $$;
select pg_temp.as_user('P');
select pg_temp.expect('pago conserva inicio, fecha de renovación y estado de confirmación', (
  select count(*) from kiru_payments p join kiru_renewals r on r.id=p.renewal_id
  where p.renewal_id=(select id from ren2)
    and p.coverage_start=(r.paid_reported_at at time zone 'Europe/Madrid')::date
    and p.coverage_end=(p.coverage_start + make_interval(months => 3))::date
    and p.reported_at is not null and p.status='pending'
), 1);
reset role;
set local role service_role;
select pg_temp.expect('la hoja recibe meses y total', (select count(*) from jsonb_array_elements(kiru_renewal_sync('[]')->'pendientes') x where (x->>'meses')::int=3 and (x->>'total')::numeric=997.5), 1);
select pg_temp.expect('sincronizar otra vez no cambia lo elegido', (select jsonb_array_length(kiru_renewal_sync('[{"email":"P@t","alumno":"Álvaro","fin":"2027-01-19","datos":{"email":"P@t","alumno":"Álvaro","fin":"2027-01-19","mantener_etiqueta":"Mantener 2 días por semana","mantener_precio":400,"adelantado":{}}}]')->'pendientes')), 1);
select pg_temp.expect('precio y meses se mantienen', (select count(*) from kiru_renewals where period_end='2027-01-19' and months=3 and keep_price=350 and prepay ? 'mantener'), 1);
select pg_temp.expect('el correo ve el pago adelantado', (select (kiru_renewal_from_email_months('p@t','Álvaro','2027-01-19','subir',3)->>'meses')::int), 3);
reset role;
set local role anon;
select pg_temp.expect_denied('anon no ve renovaciones', $q$select * from kiru_renewals$q$);
reset role;
-- Reuniones con tu coordinador y Crece con Kiru ------------------------------
-- M (grupo de C) completa la incorporación; M2 (grupo de C2) no la tiene completa.
insert into kiru_mentor_steps(mentor_id,step,status) select id, st, 'completado' from ids, unnest(array['certificado','nuestro_equipo','llamadas']) st where k='M';
insert into kiru_mentor_steps(mentor_id,step,status) values ((select id from ids where k='M2'),'nuestro_equipo','enviado');
select pg_temp.expect('M tiene la incorporación completa', (select kiru_private.mentor_can_grow((select id from ids where k='M'))::int), 1);
select pg_temp.expect('M2 no tiene acceso todavía', (select kiru_private.mentor_can_grow((select id from ids where k='M2'))::int), 0);
insert into kiru_mentor_availability(mentor_id,days,slots) values ((select id from ids where k='M'),'{lunes,martes}','{tarde}'),((select id from ids where k='M2'),'{jueves}','{noche}');
insert into kiru_coordination_meetings(coordinator_id,scheduled_at,status,zoom_url,confirmed_at) values
  ((select id from ids where k='C'),'2026-11-20 17:00+01','confirmada','https://zoom.us/j/1',now()),
  ((select id from ids where k='C'),'2026-12-18 17:00+01','borrador','',null),
  ((select id from ids where k='C2'),'2026-11-21 17:00+01','confirmada','https://zoom.us/j/2',now());
insert into kiru_opportunities(title,area,status,published_at,deadline) values
  ('Abierta','formacion','publicada',now(),null),
  ('Vencida','campus','publicada',now(),current_date - 1),
  ('Cerrada','operaciones','cerrada',now(),null),
  ('Borrador','comunicacion','borrador',null,null);
create temp table opp as select title, id from kiru_opportunities;
grant select on opp to authenticated, service_role;
grant select on ids to service_role;
do $$ begin
  insert into kiru_coordination_meetings(coordinator_id,scheduled_at,status,zoom_url,confirmed_at) values ((select id from ids where k='C'),'2026-11-05 17:00+01','confirmada','https://zoom.us/j/3',now());
  raise exception 'FAIL dos reuniones el mismo mes: allowed';
exception when unique_violation then raise notice 'ok  una reunión al mes por coordinador (denied)';
end $$;
select pg_temp.expect_denied('no se confirma sin enlace de Zoom', format($q$insert into kiru_coordination_meetings(coordinator_id,scheduled_at,status,confirmed_at) values (%L,'2027-01-15 17:00+01','confirmada',now())$q$, (select id from ids where k='C')));
select pg_temp.expect_denied('reunión de alguien que no es coordinador', format($q$insert into kiru_coordination_meetings(coordinator_id,scheduled_at) values (%L,'2027-02-15 17:00+01')$q$, (select id from ids where k='M')));

-- mentor M: su grupo, nada de otros grupos ni borradores
select pg_temp.as_user('M');
select pg_temp.expect('mentor ve la reunión confirmada de su grupo (no el borrador ni otros grupos)', (select count(*) from kiru_coordination_meetings), 1);
select pg_temp.expect('mentor ve solo su disponibilidad', (select count(*) from kiru_mentor_availability), 1);
select pg_temp.expect('mentor ve oportunidades vigentes (no borradores, vencidas ni cerradas ajenas)', (select count(*) from kiru_opportunities), 1);
select pg_temp.expect_denied('mentor no escribe su disponibilidad directamente', format($q$update kiru_mentor_availability set notes='x' where mentor_id=%L$q$, (select id from ids where k='M')));
select pg_temp.expect_denied('mentor no se presenta saltándose el servidor', format($q$insert into kiru_opportunity_applications(opportunity_id,mentor_id) values ((select id from opp where title='Abierta'),%L)$q$, (select id from ids where k='M')));
select pg_temp.expect_denied('mentor no crea oportunidades', $q$insert into kiru_opportunities(title,area) values ('Falsa','campus')$q$);
select pg_temp.expect_denied('mentor no se autoriza una excepción', format($q$insert into kiru_onboarding_exceptions(mentor_id,reason,granted_by) values (%L,'porque sí',%L)$q$, (select id from ids where k='M'), (select id from ids where k='M')));
select pg_temp.expect('mentor no ve el registro de excepciones', (select count(*) from kiru_onboarding_exceptions), 0);
reset role;
-- mentor M2 sin incorporación: no ve reuniones ni oportunidades
select pg_temp.as_user('M2');
select pg_temp.expect('mentor sin incorporación no ve reuniones', (select count(*) from kiru_coordination_meetings), 0);
select pg_temp.expect('mentor sin incorporación no ve oportunidades', (select count(*) from kiru_opportunities), 0);
reset role;
-- candidaturas (las crea el servidor con service role; los disparadores mandan)
set local role service_role;
select pg_temp.expect_allowed('M se presenta a la abierta', format($q$insert into kiru_opportunity_applications(opportunity_id,mentor_id,motivation,status) values ((select id from opp where title='Abierta'),%L,'Me interesa','aceptada')$q$, (select id from ids where k='M')));
select pg_temp.expect('la candidatura nace como enviada aunque se pida otro estado', (select count(*) from kiru_opportunity_applications where status='enviada'), 1);
select pg_temp.expect_denied('candidatura duplicada', format($q$insert into kiru_opportunity_applications(opportunity_id,mentor_id) values ((select id from opp where title='Abierta'),%L)$q$, (select id from ids where k='M')));
select pg_temp.expect_denied('candidatura fuera de plazo', format($q$insert into kiru_opportunity_applications(opportunity_id,mentor_id) values ((select id from opp where title='Vencida'),%L)$q$, (select id from ids where k='M')));
select pg_temp.expect_denied('candidatura a oportunidad cerrada', format($q$insert into kiru_opportunity_applications(opportunity_id,mentor_id) values ((select id from opp where title='Cerrada'),%L)$q$, (select id from ids where k='M')));
select pg_temp.expect_denied('candidatura a borrador', format($q$insert into kiru_opportunity_applications(opportunity_id,mentor_id) values ((select id from opp where title='Borrador'),%L)$q$, (select id from ids where k='M')));
select pg_temp.expect_denied('mentor sin incorporación no se presenta', format($q$insert into kiru_opportunity_applications(opportunity_id,mentor_id) values ((select id from opp where title='Abierta'),%L)$q$, (select id from ids where k='M2')));
select pg_temp.expect_denied('no se cambia la motivación desde fuera', $q$update kiru_opportunity_applications set motivation='otra'$q$);
select pg_temp.expect_allowed('se cambia el estado', $q$update kiru_opportunity_applications set status='en_revision'$q$);
select pg_temp.expect_allowed('C recomienda a su mentor', format($q$insert into kiru_opportunity_recommendations(opportunity_id,mentor_id,coordinator_id,note) values ((select id from opp where title='Abierta'),%L,%L,'Muy constante')$q$, (select id from ids where k='M'), (select id from ids where k='C')));
select pg_temp.expect_denied('C no recomienda a un mentor de otro grupo', format($q$insert into kiru_opportunity_recommendations(opportunity_id,mentor_id,coordinator_id,note) values ((select id from opp where title='Abierta'),%L,%L,'x x x')$q$, (select id from ids where k='M2'), (select id from ids where k='C')));
select pg_temp.expect_denied('no se recomienda para una oportunidad cerrada', format($q$insert into kiru_opportunity_recommendations(opportunity_id,mentor_id,coordinator_id,note) values ((select id from opp where title='Cerrada'),%L,%L,'x x x')$q$, (select id from ids where k='M'), (select id from ids where k='C')));
-- excepción: solo un admin, no toca los pasos, no se reescribe
select pg_temp.expect_denied('la excepción la tiene que dar un admin', format($q$insert into kiru_onboarding_exceptions(mentor_id,reason,granted_by) values (%L,'Empieza ya',%L)$q$, (select id from ids where k='M2'), (select id from ids where k='C')));
select pg_temp.expect_denied('la excepción necesita motivo', format($q$insert into kiru_onboarding_exceptions(mentor_id,reason,granted_by) values (%L,'',%L)$q$, (select id from ids where k='M2'), (select id from ids where k='A')));
select pg_temp.expect_allowed('admin autoriza a M2 con motivo', format($q$insert into kiru_onboarding_exceptions(mentor_id,reason,granted_by) values (%L,'Certificado pedido, llega la semana que viene',%L)$q$, (select id from ids where k='M2'), (select id from ids where k='A')));
select pg_temp.expect('la excepción no completa ningún paso', (select count(*) from kiru_mentor_steps where mentor_id=(select id from ids where k='M2') and status='completado'), 0);
reset role;
select pg_temp.expect('pero da acceso a M2', (select kiru_private.mentor_can_grow((select id from ids where k='M2'))::int), 1);
set local role service_role;
select pg_temp.expect('y la incorporación sigue incompleta', (select (onboarding_complete)::int from kiru_mentor_growth_access((select id from ids where k='M2'))), 0);
select pg_temp.expect_denied('una sola excepción en vigor por mentor', format($q$insert into kiru_onboarding_exceptions(mentor_id,reason,granted_by) values (%L,'Otra vez lo mismo',%L)$q$, (select id from ids where k='M2'), (select id from ids where k='A')));
select pg_temp.expect_denied('el motivo no se reescribe', $q$update kiru_onboarding_exceptions set reason='otro motivo'$q$);
reset role;
select pg_temp.as_user('M2');
select pg_temp.expect('con la excepción M2 ve la reunión de su grupo', (select count(*) from kiru_coordination_meetings), 1);
reset role;
-- coordinador C: su grupo y nada más
select pg_temp.as_user('C');
select pg_temp.expect('coordinador ve sus reuniones (también el borrador)', (select count(*) from kiru_coordination_meetings), 2);
select pg_temp.expect('coordinador ve la disponibilidad solo de su grupo', (select count(*) from kiru_mentor_availability), 1);
select pg_temp.expect('coordinador ve publicadas y cerradas, no borradores', (select count(*) from kiru_opportunities), 3);
select pg_temp.expect('coordinador no ve candidaturas', (select count(*) from kiru_opportunity_applications), 0);
select pg_temp.expect('coordinador ve su recomendación', (select count(*) from kiru_opportunity_recommendations), 1);
select pg_temp.expect('coordinador no ve excepciones', (select count(*) from kiru_onboarding_exceptions), 0);
select pg_temp.expect_denied('coordinador no publica oportunidades', $q$update kiru_opportunities set status='publicada', published_at=now()$q$);
select pg_temp.expect_denied('coordinador no acepta candidaturas', $q$update kiru_opportunity_applications set status='aceptada'$q$);
select pg_temp.expect_denied('coordinador no escribe reuniones directamente', $q$update kiru_coordination_meetings set zoom_url='https://x.y/z'$q$);
reset role;
select pg_temp.as_user('C2');
select pg_temp.expect('otro coordinador no ve reuniones de C', (select count(*) from kiru_coordination_meetings), 1);
select pg_temp.expect('otro coordinador ve la disponibilidad de su grupo', (select count(*) from kiru_mentor_availability), 1);
select pg_temp.expect('otro coordinador no ve la recomendación de C', (select count(*) from kiru_opportunity_recommendations), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('familia no ve reuniones', (select count(*) from kiru_coordination_meetings), 0);
select pg_temp.expect('familia no ve oportunidades', (select count(*) from kiru_opportunities), 0);
reset role;
select pg_temp.as_user('A');
select pg_temp.expect('admin ve todas las oportunidades', (select count(*) from kiru_opportunities), 4);
select pg_temp.expect('admin ve las excepciones', (select count(*) from kiru_onboarding_exceptions), 1);
select pg_temp.expect('admin ve todas las reuniones', (select count(*) from kiru_coordination_meetings), 3);
reset role;
set local role anon;
select pg_temp.expect_denied('anon no ve oportunidades', $q$select * from kiru_opportunities$q$);
reset role;

-- Cuadrícula de 30 minutos, peticiones de disponibilidad y grabaciones --------
select pg_temp.expect_allowed('casillas válidas de 30 minutos', format($q$update kiru_mentor_availability set cells='{lunes-09:00,jueves-18:30,domingo-21:30}', first_saved_at=now() where mentor_id=%L$q$, (select id from ids where k='M')));
select pg_temp.expect_denied('casilla fuera de horario', format($q$update kiru_mentor_availability set cells='{lunes-07:30}' where mentor_id=%L$q$, (select id from ids where k='M')));
select pg_temp.expect_denied('casilla que no es de media hora', format($q$update kiru_mentor_availability set cells='{lunes-09:15}' where mentor_id=%L$q$, (select id from ids where k='M')));
select pg_temp.expect_allowed('el coordinador también guarda su cuadrícula', format($q$insert into kiru_mentor_availability(mentor_id,cells) values (%L,'{lunes-09:00}')$q$, (select id from ids where k='C')));
insert into kiru_availability_requests(coordinator_id,deadline) values ((select id from ids where k='C'),current_date + 7),((select id from ids where k='C2'),current_date + 7);
create temp table req as select r.id, i.k from kiru_availability_requests r join ids i on i.id = r.coordinator_id;
grant select on req to authenticated, service_role;
insert into kiru_availability_responses(request_id,mentor_id) values ((select id from req where k='C'),(select id from ids where k='M'));
select pg_temp.expect_denied('respuesta de un mentor de otro grupo', format($q$insert into kiru_availability_responses(request_id,mentor_id) values (%L,%L)$q$, (select id from req where k='C'), (select id from ids where k='M2')));
select pg_temp.expect_denied('petición de alguien que no es coordinador', format($q$insert into kiru_availability_requests(coordinator_id,deadline) values (%L,current_date)$q$, (select id from ids where k='M')));
insert into kiru_coordination_meeting_private(meeting_id,recording_url,recording_registered_at) select id,'https://drive.google.com/file/d/abc/view',now() from kiru_coordination_meetings where zoom_url='https://zoom.us/j/1';

select pg_temp.as_user('M');
select pg_temp.expect('mentor no ve el enlace de la grabación', (select count(*) from kiru_coordination_meeting_private), 0);
select pg_temp.expect('mentor ve la petición de su coordinador', (select count(*) from kiru_availability_requests), 1);
select pg_temp.expect('mentor ve su respuesta', (select count(*) from kiru_availability_responses), 1);
select pg_temp.expect('mentor no ve la cuadrícula de su coordinador', (select count(*) from kiru_mentor_availability), 1);
select pg_temp.expect_denied('mentor no se anota una respuesta directamente', format($q$insert into kiru_availability_responses(request_id,mentor_id) values (%L,%L)$q$, (select id from req where k='C'), (select id from ids where k='M')));
reset role;
select pg_temp.as_user('C');
select pg_temp.expect('coordinador ve la grabación de su reunión', (select count(*) from kiru_coordination_meeting_private), 1);
select pg_temp.expect('coordinador ve su cuadrícula y la de su grupo', (select count(*) from kiru_mentor_availability), 2);
select pg_temp.expect('coordinador ve solo sus peticiones', (select count(*) from kiru_availability_requests), 1);
select pg_temp.expect('coordinador ve las respuestas de su grupo', (select count(*) from kiru_availability_responses), 1);
select pg_temp.expect_denied('coordinador no escribe la grabación directamente', $q$update kiru_coordination_meeting_private set recording_url='https://drive.google.com/x'$q$);
reset role;
select pg_temp.as_user('C2');
select pg_temp.expect('otro coordinador no ve la grabación de C', (select count(*) from kiru_coordination_meeting_private), 0);
select pg_temp.expect('otro coordinador no ve la cuadrícula de C', (select count(*) from kiru_mentor_availability where mentor_id=(select id from ids where k='C')), 0);
select pg_temp.expect('otro coordinador no ve respuestas del grupo de C', (select count(*) from kiru_availability_responses), 0);
reset role;
select pg_temp.as_user('M2');
select pg_temp.expect('mentor de otro grupo no ve la petición de C', (select count(*) from kiru_availability_requests where coordinator_id=(select id from ids where k='C')), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('familia no ve grabaciones', (select count(*) from kiru_coordination_meeting_private), 0);
select pg_temp.expect('familia no ve peticiones', (select count(*) from kiru_availability_requests), 0);
reset role;
select pg_temp.as_user('A');
select pg_temp.expect('admin ve las grabaciones', (select count(*) from kiru_coordination_meeting_private), 1);
select pg_temp.expect('admin ve todas las peticiones', (select count(*) from kiru_availability_requests), 2);
reset role;
set local role anon;
select pg_temp.expect_denied('anon no ve grabaciones', $q$select * from kiru_coordination_meeting_private$q$);
reset role;
rollback;
