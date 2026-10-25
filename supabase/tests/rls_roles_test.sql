-- Pruebas de aislamiento entre roles. Todo ocurre dentro de una transacción
-- que se deshace al final; no deja datos.
\set ON_ERROR_STOP 1
begin;
-- ids
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('M2',gen_random_uuid()),('P',gen_random_uuid()),('S1',gen_random_uuid()),('S2',gen_random_uuid()),('S3',gen_random_uuid()),('X',gen_random_uuid()),('F',gen_random_uuid()),('MN',gen_random_uuid());
grant select on ids to authenticated;
insert into auth.users(id,email,raw_app_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k when 'A' then 'admin' when 'X' then 'admin' when 'M' then 'mentor' when 'M2' then 'mentor' when 'P' then 'padre' when 'F' then 'formador' when 'MN' then 'mentor' else 'alumno' end) from ids;
update profiles set is_active=false where id=(select id from ids where k='S3');
insert into student_mentors values ((select id from ids where k='S1'),(select id from ids where k='M')),((select id from ids where k='S2'),(select id from ids where k='M2'));
insert into student_guardians(student_id,guardian_id) values ((select id from ids where k='S1'),(select id from ids where k='P'));
insert into kiru_payments(student_id,concept,amount_cents,created_by) select id,'cuota',100,(select id from ids where k='A') from ids where k in ('S1','S2','S3');
insert into kiru_notices(title,content,created_by,target_student_id) values ('global','x',(select id from ids where k='A'),null),('s1','x',(select id from ids where k='A'),(select id from ids where k='S1')),('s2','x',(select id from ids where k='A'),(select id from ids where k='S2'));
insert into kiru_app_records(owner_id,record_type,record_key,created_by) select id,'progress','p_'||k,id from ids where k in ('S1','S2','S3');
insert into kiru_flashcard_sets(student_id,created_by,title) select id,(select id from ids where k='A'),'set' from ids where k in ('S1','S2');
insert into kiru_flashcards(set_id,term,definition) select id,'t','d' from kiru_flashcard_sets;

insert into kiru_mentor_onboarding(full_name,email,profile_id) values ('Mentor nuevo','mn@t.es',(select id from ids where k='MN'));

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
  begin execute stmt; exception when insufficient_privilege or check_violation then raise notice 'ok  % (denied)', label; return; end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
create function pg_temp.expect_allowed(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; raise notice 'ok  % (allowed)', label; end $$;
grant execute on all functions in schema pg_temp to authenticated;
-- admin
select pg_temp.as_user('A');
select pg_temp.expect('admin ve 10 perfiles', (select count(*) from profiles), 10);
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
reset role;
rollback;
