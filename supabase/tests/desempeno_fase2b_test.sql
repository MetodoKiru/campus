-- Pruebas de la Fase 2b del desempeño: entregas bimestrales («Descubrirme» y «Misión»),
-- aclaraciones, exenciones (solo Administración), escalera de recordatorios y cálculo de
-- A1, A2 y B4 completo. Todo ocurre dentro de una transacción que se deshace al final.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('M2',gen_random_uuid()),('C',gen_random_uuid()),
  ('P',gen_random_uuid()),('S1',gen_random_uuid()),('S2',gen_random_uuid());
grant select on ids to authenticated, anon;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'A' then 'admin' when 'M' then 'mentor' when 'M2' then 'mentor' when 'C' then 'coordinador' when 'P' then 'padre'
  else 'alumno' end), jsonb_build_object('full_name', k || ' Prueba') from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
insert into student_mentors(student_id, mentor_id, assigned_at) values
  (pg_temp.i('S1'), pg_temp.i('M'), now() - interval '200 days'), (pg_temp.i('S2'), pg_temp.i('M2'), now() - interval '200 days');
insert into student_guardians(student_id, guardian_id) values (pg_temp.i('S1'), pg_temp.i('P'));
insert into kiru_coordinator_mentors(mentor_id,coordinator_id) values (pg_temp.i('M'),pg_temp.i('C'));

create function pg_temp.as_user(k text) returns void language plpgsql as $$
declare u uuid;
begin
  reset role;
  u := pg_temp.i(k);
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','app_metadata',
    json_build_object('kiru_role',(select raw_app_meta_data->>'kiru_role' from auth.users where id=u)))::text, true);
  set local role authenticated;
end $$;
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
create function pg_temp.expect_denied(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when insufficient_privilege or check_violation or raise_exception then
    raise notice 'ok  % (denied)', label; return;
  end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;
create temp table t as select (now() at time zone 'Europe/Madrid')::date as today;
grant select on t to authenticated, anon;
create function pg_temp.day(n int) returns date language sql stable as $$ select today + n from t $$;
create function pg_temp.ts(n int) returns timestamptz language sql stable as $$ select ((today + n)::timestamp + time '10:00') at time zone 'Europe/Madrid' from t $$;

-- El sistema cuenta desde hace 100 días (en producción, el 01/01/2027).
update kiru_perf_settings set data_from = pg_temp.day(-100), official_from = pg_temp.day(-100);

-- Periodos de pago: M con S1 desde hace 150 días (dos periodos seguidos); M2 con S2 solo 15 días.
insert into kiru_mentor_payouts(sheet_key, mentor_name, student_name, mentor_id, student_id, period_start, period_end) values
  ('m|s1|a', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), pg_temp.day(-150), pg_temp.day(-40)),
  ('m|s1|b', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), pg_temp.day(-40), pg_temp.day(30)),
  ('m2|s2|a', 'M2', 'S2', pg_temp.i('M2'), pg_temp.i('S2'), pg_temp.day(-75), pg_temp.day(-60));
-- Bimestres esperados de M con S1: los que empiezan desde la fecha de inicio y antes de hoy.
create temp table bims as
  select (pg_temp.day(-150) + make_interval(months => 2 * k))::date as s, (pg_temp.day(-150) + make_interval(months => 2 * (k + 1)))::date as e
  from generate_series(0, 5) k
  where (pg_temp.day(-150) + make_interval(months => 2 * k))::date between pg_temp.day(-100) and pg_temp.day(0);
grant select on bims to authenticated;

-- 1. Crear las entregas ----------------------------------------------------------------------
select pg_temp.expect('se crean 2 entregas por bimestre y pareja', kiru_private.evidence_generate(), 2 * ((select count(*) from bims) + 1));
select pg_temp.expect('repetirlo no duplica nada', kiru_private.evidence_generate(), 0);
select pg_temp.expect('el bimestre anterior a la fecha de inicio no se crea',
  (select count(*) from kiru_material_evidence where bimester_start = pg_temp.day(-150)), 0);
select pg_temp.expect('M con S1: Descubrirme y Misión de cada bimestre',
  (select count(*) from kiru_material_evidence where mentor_id = pg_temp.i('M')), 2 * (select count(*) from bims));
select pg_temp.expect('pareja con menos de 4 semanas: exenta sola',
  (select count(*) from kiru_material_evidence where mentor_id = pg_temp.i('M2') and status = 'exenta'), 2);
select pg_temp.expect_text('el plazo es de 5 días tras el cierre, a las 23:59 de Madrid',
  (select to_char(due_at at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI') from kiru_material_evidence
   where mentor_id = pg_temp.i('M') and kind = 'mision' order by bimester_start limit 1),
  (select to_char(min(e) + 4, 'YYYY-MM-DD') || ' 23:59' from bims));
create function pg_temp.ev(kind text, n int) returns uuid language sql stable as $$
  select id from kiru_material_evidence where mentor_id = pg_temp.i('M') and kiru_material_evidence.kind = ev.kind
  order by bimester_start offset n - 1 limit 1 $$;
grant execute on function pg_temp.ev(text, int) to authenticated, anon;

-- 2. Quién ve qué -------------------------------------------------------------------------------
select pg_temp.as_user('M');
select pg_temp.expect('el mentor ve sus entregas', (select count(*) from kiru_material_evidence), 2 * (select count(*) from bims));
select pg_temp.as_user('M2');
select pg_temp.expect('otro mentor solo ve las suyas', (select count(*) from kiru_material_evidence), 2);
select pg_temp.as_user('C');
select pg_temp.expect('el coordinador ve las de sus mentores', (select count(*) from kiru_material_evidence), 2 * (select count(*) from bims));
select pg_temp.as_user('P');
select pg_temp.expect('la familia no ve nada', (select count(*) from kiru_material_evidence), 0);
select pg_temp.expect_denied('nadie escribe directamente', $$update kiru_material_evidence set status = 'validada'$$);
reset role;

-- 3. Entrega de «Descubrirme» con fotos ---------------------------------------------------------
select pg_temp.as_user('M2');
select pg_temp.expect_denied('otro mentor no puede entregarla', $$select kiru_evidence_start(pg_temp.ev('descubrirme', 1), 'x')$$);
select pg_temp.as_user('M');
create temp table msg(k text primary key, id uuid);
grant all on msg to authenticated;
insert into msg select 'd1', kiru_evidence_start(pg_temp.ev('descubrirme', 1), 'Ha trabajado sus fortalezas con las tarjetas de emociones.');
create function pg_temp.path(n int) returns text language sql stable as $$
  select 'material/' || pg_temp.ev('descubrirme', 1) || '/' || (select id from msg where k = 'd1') || '/foto' || n || '.jpg' $$;
grant execute on function pg_temp.path(int) to authenticated, anon;
insert into storage.objects(bucket_id, name) select 'kiru-evidencias', pg_temp.path(n) from generate_series(1, 3) n;
select pg_temp.expect('el mentor sube las fotos a la carpeta de su entrega', (select count(*) from storage.objects where name like 'material/%'), 3);
select pg_temp.expect_denied('no puede subir fuera de su carpeta',
  $$insert into storage.objects(bucket_id, name) values ('kiru-evidencias', 'material/' || pg_temp.ev('mision', 1) || '/x/foto.jpg')$$);
select kiru_evidence_add_file((select id from msg where k = 'd1'), pg_temp.path(1), 'foto1.jpg', 'image/jpeg', 1000);
select kiru_evidence_add_file((select id from msg where k = 'd1'), pg_temp.path(2), 'foto2.jpg', 'image/jpeg', 1000);
select pg_temp.expect_denied('con 2 fotos no se puede enviar', $$select kiru_evidence_send((select id from msg where k = 'd1'))$$);
select pg_temp.expect_denied('solo fotos', $$select kiru_evidence_add_file((select id from msg where k = 'd1'), pg_temp.path(3), 'a.pdf', 'application/pdf', 1000)$$);
select kiru_evidence_add_file((select id from msg where k = 'd1'), pg_temp.path(3), 'foto3.jpg', 'image/jpeg', 1000);
select kiru_evidence_send((select id from msg where k = 'd1'));
select pg_temp.expect_text('con 3 fotos y una línea queda entregada', (select status from kiru_material_evidence where id = pg_temp.ev('descubrirme', 1)), 'entregada');
select pg_temp.as_user('M2');
select pg_temp.expect('otro mentor no ve las fotos', (select count(*) from storage.objects where name like 'material/%'), 0);
select pg_temp.as_user('C');
select pg_temp.expect('el coordinador ve las fotos', (select count(*) from storage.objects where name like 'material/%'), 3);
reset role;
select pg_temp.expect('Coordinación recibe el aviso en la campanita (sin correo)',
  (select count(*) from kiru_notifications where kind = 'evidencia_entregada' and recipient_id = pg_temp.i('C') and email_status = 'no_aplica'), 1);

-- 4. Aclaración y validación ----------------------------------------------------------------------
select pg_temp.as_user('M');
select pg_temp.expect_denied('el mentor no valida', $$select kiru_evidence_review(pg_temp.ev('descubrirme', 1), 'validar')$$);
select pg_temp.as_user('C');
select pg_temp.expect_denied('pedir aclaración exige explicarla', $$select kiru_evidence_review(pg_temp.ev('descubrirme', 1), 'aclaracion', '')$$);
select kiru_evidence_review(pg_temp.ev('descubrirme', 1), 'aclaracion', 'Falta una foto donde se vea la actividad terminada.');
select pg_temp.expect_text('queda en aclaración', (select status from kiru_material_evidence where id = pg_temp.ev('descubrirme', 1)), 'aclaracion');
reset role;
select pg_temp.expect('el mentor recibe aviso y correo',
  (select count(*) from kiru_notifications where kind = 'evidencia_aclaracion' and recipient_id = pg_temp.i('M') and email_status = 'pendiente'), 1);
select pg_temp.as_user('M');
insert into msg select 'd2', kiru_evidence_start(pg_temp.ev('descubrirme', 1), 'Añado la foto de la actividad terminada.');
select kiru_evidence_send((select id from msg where k = 'd2'));
select pg_temp.expect_text('al contestar vuelve a entregada', (select status from kiru_material_evidence where id = pg_temp.ev('descubrirme', 1)), 'entregada');
select pg_temp.as_user('C');
select kiru_evidence_review(pg_temp.ev('descubrirme', 1), 'validar', 'Perfecto');
select pg_temp.expect_text('validada', (select status from kiru_material_evidence where id = pg_temp.ev('descubrirme', 1)), 'validada');
select pg_temp.expect_denied('una validada no se vuelve a revisar', $$select kiru_evidence_review(pg_temp.ev('descubrirme', 1), 'aclaracion', 'x')$$);
reset role;
select pg_temp.expect_denied('el historial no se borra', $$delete from kiru_material_evidence_messages where id = (select id from msg where k = 'd1')$$);

-- 5. Misión con solo descripción -----------------------------------------------------------------
select pg_temp.as_user('M');
insert into msg select 'm0', kiru_evidence_start(pg_temp.ev('mision', 1), 'corta');
select pg_temp.expect_denied('una misión sin foto necesita una descripción', $$select kiru_evidence_send((select id from msg where k = 'm0'))$$);
reset role;

-- 6. Exenciones: solo las aprueba Administración ----------------------------------------------------
select pg_temp.as_user('M');
create temp table ex(k text primary key, id uuid);
grant all on ex to authenticated;
select pg_temp.expect_denied('la causa hay que explicarla', $$select kiru_evidence_exemption_propose(pg_temp.ev('descubrirme', 2), 'material_no_disponible', '')$$);
insert into ex select 'e1', kiru_evidence_exemption_propose(pg_temp.ev('descubrirme', 2), 'material_no_disponible', 'No llegó el cuaderno');
select pg_temp.expect_denied('una sola propuesta abierta', $$select kiru_evidence_exemption_propose(pg_temp.ev('descubrirme', 2), 'otra', 'otra vez')$$);
select pg_temp.as_user('M2');
select pg_temp.expect_denied('otro mentor no propone por él', $$select kiru_evidence_exemption_propose(pg_temp.ev('mision', 2), 'otra', 'x')$$);
select pg_temp.as_user('C');
insert into ex select 'e2', kiru_evidence_exemption_propose(pg_temp.ev('mision', 2), 'ausencia_alumno', 'Viaje familiar de 5 semanas');
select pg_temp.expect_denied('Coordinación no aprueba exenciones', $$select kiru_evidence_exemption_decide(array[(select id from ex where k = 'e1')], true)$$);
select pg_temp.as_user('A');
select pg_temp.expect('Administración aprueba varias a la vez', kiru_evidence_exemption_decide(array(select id from ex), true, 'Ok'), 2);
select pg_temp.expect('decidir otra vez no cambia nada', kiru_evidence_exemption_decide(array(select id from ex), false), 0);
select pg_temp.expect('las dos entregas quedan exentas',
  (select count(*) from kiru_material_evidence where id in (pg_temp.ev('descubrirme', 2), pg_temp.ev('mision', 2)) and status = 'exenta'), 2);
reset role;
select pg_temp.expect('Administración recibió los avisos de exención', (select count(*) from kiru_notifications where kind = 'exencion_propuesta' and recipient_id = pg_temp.i('A')), 2);
select pg_temp.expect('el mentor y Coordinación reciben la decisión',
  (select count(distinct recipient_id) from kiru_notifications where kind = 'exencion_resuelta'), 2);

-- 7. Escalera de recordatorios ---------------------------------------------------------------------
-- La misión del primer bimestre sigue sin enviar y su plazo pasó hace semanas.
select pg_temp.expect('en modo oculto no sale ningún recordatorio', kiru_private.evidence_reminders(), 0);
update kiru_perf_settings set mode = 'aprendizaje';
select pg_temp.expect('fuera del modo oculto salen los 3 pasos', kiru_private.evidence_reminders(), 3);
select pg_temp.expect('nunca se repiten', kiru_private.evidence_reminders(), 0);
select pg_temp.expect('pasos 1 y 2 al mentor, con correo',
  (select count(*) from kiru_notifications where kind = 'evidencia_recordatorio' and recipient_id = pg_temp.i('M') and email_status = 'pendiente'), 2);
select pg_temp.expect('el 3.º abre una revisión para su coordinador',
  (select count(*) from kiru_notifications where kind = 'evidencia_revision' and recipient_id = pg_temp.i('C')), 1);
select pg_temp.expect('y no crea ninguna incidencia', (select count(*) from kiru_class_requests where incident is not null and incident <> 'ninguna'), 0);
select pg_temp.as_user('M');
select pg_temp.expect_denied('la tarea diaria es solo de Administración', $$select kiru_evidencias_tarea_diaria()$$);
select pg_temp.as_user('A');
select pg_temp.expect_text('Administración puede lanzarla', (kiru_evidencias_tarea_diaria() ->> 'recordatorios'), '0');
reset role;
update kiru_perf_settings set mode = 'oculto';

-- 8. Cálculo -----------------------------------------------------------------------------------------
-- SkillCoins: dos semanas con clase, una con SkillCoins.
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers) values
  ('sc1', pg_temp.ts(-20), pg_temp.day(-20), 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[{"q":"Estudios","a":"8"},{"q":"Compromiso","a":"7"},{"q":"Organización","a":"6"},{"q":"Bienestar","a":"9"}]'),
  ('sc2', pg_temp.ts(-13), pg_temp.day(-13), 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]');
-- Supervisión: una justificación cerrada sin error y un aviso de nivel 1 (−10).
insert into kiru_skillcoin_reviews(student_id, mentor_id, week, competencia, score_snapshot, requested_role, reason, question, status, resolution, resolved_at)
values (pg_temp.i('S1'), pg_temp.i('M'), date_trunc('week', pg_temp.day(-20))::date, 'estudios', 10, 'coordinador', 'r', 'q', 'cerrada', 'adecuada', now() - interval '5 days');
insert into kiru_methodology_warnings(mentor_id, competencia, origin, level, criterion)
values (pg_temp.i('M'), 'estudios', 'manual', 1, 'Criterio');
-- Recuperaciones (periodos de pago de S1: hasta -40 y de -40 a +30).
insert into kiru_class_sessions(id, student_id, mentor_id, kind, original_start, scheduled_start, scheduled_end, delivery, consumption, cancel_cause, cancelled_at, recovery)
values
  ('00000000-0000-4000-8000-0000000000b1', pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.ts(-18), pg_temp.ts(-18), pg_temp.ts(-18) + interval '1 hour', 'no_impartida', 'conservada', 'mentor', pg_temp.ts(-20), 'realizada'),
  ('00000000-0000-4000-8000-0000000000b2', pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.ts(-17), pg_temp.ts(-17), pg_temp.ts(-17) + interval '1 hour', 'no_impartida', 'conservada', 'mentor', pg_temp.ts(-20), 'programada'),
  ('00000000-0000-4000-8000-0000000000b3', pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.ts(-50), pg_temp.ts(-50), pg_temp.ts(-50) + interval '1 hour', 'no_impartida', 'conservada', 'mentor', pg_temp.ts(-51), 'realizada'),
  ('00000000-0000-4000-8000-0000000000b4', pg_temp.i('S1'), pg_temp.i('M'), 'regular', pg_temp.ts(-45), pg_temp.ts(-45), pg_temp.ts(-45) + interval '1 hour', 'no_impartida', 'conservada', 'mentor', pg_temp.ts(-46), 'pendiente');
insert into kiru_class_requests(session_id, mentor_id, student_id, kind, requested_by, requester_role, status, created_at)
select id, pg_temp.i('M'), pg_temp.i('S1'), 'propuesta_recuperacion', pg_temp.i('M'), 'mentor', 'elegida', cancelled_at + interval '1 day'
from kiru_class_sessions where id::text like '00000000-0000-4000-8000-0000000000b%';
-- b1 recuperada dentro del periodo; b3 recuperada después de que terminara su periodo.
insert into kiru_class_sessions(student_id, mentor_id, kind, recovers_session_id, original_start, scheduled_start, scheduled_end, delivery, consumption, recovery)
values
  (pg_temp.i('S1'), pg_temp.i('M'), 'recuperacion', '00000000-0000-4000-8000-0000000000b1', pg_temp.ts(-10), pg_temp.ts(-10), pg_temp.ts(-10) + interval '1 hour', 'impartida', 'no_aplica', 'ninguna'),
  (pg_temp.i('S1'), pg_temp.i('M'), 'recuperacion', '00000000-0000-4000-8000-0000000000b3', pg_temp.ts(-35), pg_temp.ts(-35), pg_temp.ts(-35) + interval '1 hour', 'impartida', 'no_aplica', 'ninguna');

create temp table v as select kiru_private.perf_indicator_values_2b(pg_temp.i('M'), now() - interval '120 days', now() + interval '1 day',
  (select rules from kiru_perf_rule_versions where status = 'aprobada')) as x;
select pg_temp.expect('A1: Descubrirme validado = 100', (select (x #>> '{A1,value}')::numeric from v), 100);
select pg_temp.expect('A1 no cuenta lo pendiente ni lo exento', (select (x #>> '{A1,total}')::numeric from v), 1);
select pg_temp.expect('A2: misión sin entregar tras 3 recordatorios = 0', (select (x #>> '{A2,detail,parte_mision}')::numeric from v), 0);
select pg_temp.expect('A2: 1 de 2 semanas con SkillCoins = 50', (select (x #>> '{A2,detail,parte_skillcoins}')::numeric from v), 50);
select pg_temp.expect('A2: supervisión 100 menos 10 por el aviso de nivel 1 = 90', (select (x #>> '{A2,detail,parte_supervision}')::numeric from v), 90);
select pg_temp.expect('A2 = 0,4×50 + 0,3×90 + 0,3×0 = 47', (select (x #>> '{A2,value}')::numeric from v), 47);
select pg_temp.expect('B4: 1 de 3 (recuperación fuera del periodo y periodo vencido sin recuperar no cumplen)',
  (select (x #>> '{B4,value}')::numeric from v), 33.3);
select pg_temp.expect('B4: la que aún puede recuperarse dentro del periodo no cuenta', (select (x #>> '{B4,detail,aun_dentro_del_periodo}')::numeric from v), 1);
create temp table v2 as select kiru_private.perf_indicator_values_2b(pg_temp.i('M2'), now() - interval '120 days', now() + interval '1 day',
  (select rules from kiru_perf_rule_versions where status = 'aprobada')) as x;
select pg_temp.expect_text('A1 no aplica si todas las entregas están exentas', (select x #>> '{A1,status}' from v2), 'no_aplica');
select pg_temp.expect_text('A2 pendiente sin ningún dato (nunca cero)', (select x #>> '{A2,status}' from v2), 'pendiente');
select pg_temp.expect_text('B4 no aplica sin recuperaciones', (select x #>> '{B4,status}' from v2), 'no_aplica');

-- 9. El ensayo junta todo y sigue siendo solo de Administración ------------------------------------
select pg_temp.as_user('A');
select pg_temp.expect('el ensayo junta los 10 indicadores con datos (B4 completo sustituye al de la fase 1)',
  (select count(*) from jsonb_object_keys((kiru_perf_preview(current_date - 120, current_date + 1) -> 'mentors' -> 0 -> 'values'))), 10);
select pg_temp.as_user('C');
select pg_temp.expect_denied('el coordinador sigue sin ver puntuaciones', $$select kiru_perf_preview(current_date - 30, current_date)$$);
reset role;
set local role anon;
select pg_temp.expect_denied('sin sesión no se entrega nada', $$select kiru_evidence_start(pg_temp.ev('mision', 1), 'x')$$);
reset role;
select pg_temp.expect('el cálculo sigue sin leer importes ni el extra de 10 €',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (p.proname like 'perf\_%' or p.proname like 'kiru\_perf\_%' or p.proname like 'kiru\_evidence%' or p.proname like 'evidence\_%')
     and p.prosrc ~* 'payout|kiru_payments|extra_cents|amount_cents'), 0);

rollback;
