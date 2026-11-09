-- Pruebas de la supervisión metodológica de SkillCoins: quién ve qué, solicitudes,
-- respuestas, adjuntos, resolución A/B/C, avisos con vigencia de 6 meses,
-- recordatorios sin duplicados, historial inmutable y SkillCoins intactas.
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
  exception when insufficient_privilege or check_violation or unique_violation or raise_exception then
    raise notice 'ok  % (denied)', label; return;
  end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Registros de sesión: 4 semanas de S1 (mentor M) y 1 de S2 (mentor M2).
create function pg_temp.answers(e int, c int, o int, b int, dificil text) returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('q','Mes de la sesión','a','2026-10-01'),
    jsonb_build_object('q','SKILLCOINS: estudios (0-10)','a',e::text),
    jsonb_build_object('q','SKILLCOINS: compromiso(0-10)','a',c::text),
    jsonb_build_object('q','SKILLCOINS: organización(0-10)','a',o::text),
    jsonb_build_object('q','SKILLCOINS: bienestar(0-10)','a',b::text),
    jsonb_build_object('q','¿Qué ha sido lo que más le ha costado esta semana?','a',dificil)) $$;
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers) values
  ('s1-w1', '2026-10-06 18:00+02', '2026-10-06', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), pg_temp.answers(7,8,10,6,'Organizarse con la agenda')),
  ('s1-w2', '2026-10-13 18:00+02', '2026-10-13', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), pg_temp.answers(7,8,10,6,'Sigue sin apuntar en la agenda')),
  ('s1-w2b','2026-10-12 18:00+02', '2026-10-13', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), pg_temp.answers(1,1,1,1,'Registro anterior de la misma semana')),
  ('s1-w3', '2026-10-20 18:00+02', '2026-10-20', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), pg_temp.answers(8,9,10,7,'Planificar')),
  ('s1-w4', '2026-10-27 18:00+02', '2026-10-27', 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), pg_temp.answers(8,9,10,7,'Concentrarse')),
  ('s2-w1', '2026-10-06 18:00+02', '2026-10-06', 'M2','S2', pg_temp.i('M2'),pg_temp.i('S2'), pg_temp.answers(5,5,5,5,'Nada'));
create function pg_temp.log(k text) returns uuid language sql stable as $$ select id from kiru_session_logs where source_key = k $$;
create temp table rv(k text primary key, id uuid);
grant select, insert on rv to authenticated;
create function pg_temp.r(k text) returns uuid language sql stable as $$ select id from rv where rv.k = r.k $$;
create temp table before_sc as select kiru_private.skillcoins_earned(pg_temp.i('S1')) earned,
  (select jsonb_agg(w order by w.week) from kiru_private.skillcoin_weeks(pg_temp.i('S1')) w) weeks;

-- 1. Lectura de notas -----------------------------------------------------------------
select pg_temp.expect('la lectura por registro coincide con la de la tienda', (
  select count(*) from kiru_private.skillcoin_weeks(pg_temp.i('S1')) a
  full join kiru_private.skillcoin_week_logs(pg_temp.i('S1')) b using (week)
  where a.estudios is distinct from b.estudios or a.compromiso is distinct from b.compromiso
     or a.organizacion is distinct from b.organizacion or a.bienestar is distinct from b.bienestar), 0);
select pg_temp.expect_text('cuenta el registro más reciente de la semana', (
  select log_id::text from kiru_private.skillcoin_week_logs(pg_temp.i('S1')) where week = '2026-10-12'), pg_temp.log('s1-w2')::text);

select pg_temp.as_user('C');
select pg_temp.expect('el coordinador ve las 4 semanas de los alumnos de sus mentores', (select jsonb_array_length(public.kiru_supervision_evaluations('2026-01-01'))), 4);
select pg_temp.expect('y con las observaciones de texto (sin las preguntas de SC)', (
  select jsonb_array_length(public.kiru_supervision_evaluations('2026-01-01') -> 0 -> 'observations')), 1);
reset role;
select pg_temp.as_user('A');
select pg_temp.expect('administración ve todas', (select jsonb_array_length(public.kiru_supervision_evaluations('2026-01-01'))), 5);
reset role;
select pg_temp.as_user('M');
select pg_temp.expect_denied('un mentor no usa la vista de supervisión', $$select public.kiru_supervision_evaluations()$$);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect_denied('una familia tampoco', $$select public.kiru_supervision_evaluations()$$);
reset role;

-- 2. Solicitar justificación -------------------------------------------------------------
select pg_temp.as_user('C2');
select pg_temp.expect_denied('un coordinador no revisa mentores de otro', format($q$select public.kiru_request_sc_review(%L,'organizacion','otro','x','y')$q$, pg_temp.log('s1-w1')));
reset role;
select pg_temp.as_user('M');
select pg_temp.expect_denied('un mentor no pide revisiones', format($q$select public.kiru_request_sc_review(%L,'organizacion','otro','x','y')$q$, pg_temp.log('s1-w1')));
reset role;
select pg_temp.as_user('C');
select pg_temp.expect_denied('solo el registro que cuenta en su semana', format($q$select public.kiru_request_sc_review(%L,'organizacion','otro','x','y')$q$, pg_temp.log('s1-w2b')));
insert into rv values ('r1', public.kiru_request_sc_review(pg_temp.log('s1-w1'), 'organizacion', 'posible_contradiccion',
  'Organización 10 y la observación dice que le cuesta la agenda', '¿Qué viste en la sesión para poner un 10?'));
select pg_temp.expect_denied('no se abre dos veces la misma nota', format($q$select public.kiru_request_sc_review(%L,'organizacion','otro','x','y')$q$, pg_temp.log('s1-w1')));
reset role;
select pg_temp.expect_text('guarda la nota original, semana y estado', (
  select score_snapshot||'/'||week||'/'||status||'/'||requested_role from kiru_skillcoin_reviews where id = pg_temp.r('r1')), '10/2026-10-05/pendiente_respuesta/coordinador');
select pg_temp.expect('el mentor recibe aviso con correo', (
  select count(*) from kiru_notifications where recipient_id = pg_temp.i('M') and review_id = pg_temp.r('r1')
  and kind = 'justificacion_solicitada' and email_status = 'pendiente'), 1);

-- 3. Quién ve la revisión ----------------------------------------------------------------
select pg_temp.as_user('M');
select pg_temp.expect('el mentor ve su revisión', (select count(*) from kiru_skillcoin_reviews), 1);
select pg_temp.expect('el mentor no ve el historial de auditoría', (select count(*) from kiru_supervision_events), 0);
select pg_temp.expect_denied('nadie escribe directamente en la tabla', format($q$update kiru_skillcoin_reviews set score_snapshot = 1 where id = %L$q$, pg_temp.r('r1')));
reset role;
select pg_temp.as_user('M2');
select pg_temp.expect('otro mentor no la ve', (select count(*) from kiru_skillcoin_reviews), 0);
select pg_temp.expect_denied('ni puede responder', format($q$select public.kiru_answer_sc_review(%L,'hola')$q$, pg_temp.r('r1')));
reset role;
select pg_temp.as_user('C2');
select pg_temp.expect('otro coordinador no la ve', (select count(*) from kiru_skillcoin_reviews), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('la familia no la ve', (select count(*) from kiru_skillcoin_reviews), 0);
reset role;

-- 4. Respuesta y adjuntos -----------------------------------------------------------------
select pg_temp.as_user('M');
insert into rv values ('m1', public.kiru_answer_sc_review(pg_temp.r('r1'), 'Preparó sola la agenda de la semana', 'Autonomía completa = 10'));
select public.kiru_answer_sc_review(pg_temp.r('r1'), 'Añado la foto del cuaderno');
insert into storage.objects(bucket_id, name) values ('kiru-evidencias', pg_temp.r('r1')||'/'||pg_temp.r('m1')||'/cuaderno.jpg');
select pg_temp.expect_denied('no sube fuera de su carpeta', format($q$insert into storage.objects(bucket_id, name) values ('kiru-evidencias', %L)$q$, pg_temp.r('r1')||'/otra/x.jpg'));
insert into rv values ('f1', public.kiru_sc_review_add_file(pg_temp.r('m1'), pg_temp.r('r1')||'/'||pg_temp.r('m1')||'/cuaderno.jpg', 'cuaderno.jpg', 'image/jpeg', 2048));
select pg_temp.expect_denied('no registra un archivo que no ha subido', format($q$select public.kiru_sc_review_add_file(%L,%L,'x.jpg','image/jpeg',10)$q$, pg_temp.r('m1'), pg_temp.r('r1')||'/'||pg_temp.r('m1')||'/x.jpg'));
reset role;
select pg_temp.expect_text('pasa a respondida', (select status from kiru_skillcoin_reviews where id = pg_temp.r('r1')), 'respondida');
select pg_temp.expect('el coordinador recibe un solo aviso con correo aunque haya dos mensajes', (
  select count(*) from kiru_notifications where recipient_id = pg_temp.i('C') and kind = 'justificacion_respondida' and email_status = 'pendiente'), 1);
select pg_temp.as_user('C');
select pg_temp.expect('el coordinador ve la evidencia', (select count(*) from storage.objects where bucket_id = 'kiru-evidencias'), 1);
select pg_temp.expect('y su ficha', (select count(*) from kiru_skillcoin_review_files), 1);
reset role;
select pg_temp.as_user('C2');
select pg_temp.expect('otro coordinador no ve la evidencia', (select count(*) from storage.objects where bucket_id = 'kiru-evidencias'), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('la familia no ve la evidencia', (select count(*) from storage.objects where bucket_id = 'kiru-evidencias'), 0);
reset role;
select pg_temp.expect_denied('los mensajes no se borran (ni con permisos totales)', format($q$delete from kiru_skillcoin_review_messages where id = %L$q$, pg_temp.r('m1')));
select pg_temp.expect_denied('los adjuntos no se cambian', format($q$update kiru_skillcoin_review_files set file_name = 'x' where id = %L$q$, pg_temp.r('f1')));
select pg_temp.expect_denied('las revisiones no se borran', format($q$delete from kiru_skillcoin_reviews where id = %L$q$, pg_temp.r('r1')));

-- 5. Valorar, repreguntar y cerrar con B ----------------------------------------------------
select pg_temp.as_user('C');
select public.kiru_sc_review_start_assessment(pg_temp.r('r1'));
select pg_temp.expect_text('al abrirla queda pendiente de valoración', (select status from kiru_skillcoin_reviews where id = pg_temp.r('r1')), 'pendiente_valoracion');
select public.kiru_sc_review_ask_more(pg_temp.r('r1'), '¿Hay alguna foto de la agenda?');
select pg_temp.expect_text('la repregunta vuelve a pendiente de respuesta (vuelta 2)', (select status||'/'||round from kiru_skillcoin_reviews where id = pg_temp.r('r1')), 'pendiente_respuesta/2');
select pg_temp.expect_denied('no se valora sin respuesta', format($q$select public.kiru_resolve_sc_review(%L,'adecuada')$q$, pg_temp.r('r1')));
reset role;
select pg_temp.as_user('M');
select public.kiru_answer_sc_review(pg_temp.r('r1'), 'No tengo foto, lo vi en la sesión');
reset role;
select pg_temp.expect('nuevo aviso al coordinador en la vuelta 2', (
  select count(*) from kiru_notifications where recipient_id = pg_temp.i('C') and kind = 'justificacion_respondida'), 2);
select pg_temp.as_user('C');
select public.kiru_resolve_sc_review(pg_temp.r('r1'), 'insuficiente', 'No queda claro el criterio', 'Organización 10 = planifica solo toda la semana',
  'Anotar evidencias concretas', 'Manual v2, Sistema SkillCoins: Conozco mi organización');
reset role;
select pg_temp.expect_text('queda cerrada con resultado B', (select status||'/'||resolution from kiru_skillcoin_reviews where id = pg_temp.r('r1')), 'cerrada/insuficiente');
select pg_temp.expect_text('primer aviso de organización', (select level||'/'||origin||'/'||status from kiru_methodology_warnings where review_id = pg_temp.r('r1')), '1/insuficiente/pendiente');
select pg_temp.expect('el aviso llega al mentor con correo', (
  select count(*) from kiru_notifications where recipient_id = pg_temp.i('M') and kind = 'aviso_metodologico' and email_status = 'pendiente'), 1);
select pg_temp.as_user('M');
select pg_temp.expect_denied('no se adjunta a una revisión cerrada', format($q$insert into storage.objects(bucket_id, name) values ('kiru-evidencias', %L)$q$, pg_temp.r('r1')||'/'||pg_temp.r('m1')||'/tarde.jpg'));
select pg_temp.expect('el mentor ve su aviso', (select count(*) from kiru_methodology_warnings), 1);
reset role;

-- 6. Progresión y vigencia de 6 meses ------------------------------------------------------
select pg_temp.as_user('C');
insert into rv values ('r2', public.kiru_request_sc_review(pg_temp.log('s1-w2'), 'organizacion', 'maximo_repetido', 'Tres dieces seguidos', '¿Qué criterio usas?'));
reset role;
select pg_temp.as_user('M');
select public.kiru_answer_sc_review(pg_temp.r('r2'), 'No sé muy bien cómo puntuar organización');
reset role;
select pg_temp.as_user('C');
select public.kiru_resolve_sc_review(pg_temp.r('r2'), 'necesita_formacion', '', 'Criterio de organización');
reset role;
select pg_temp.expect_text('mismo error en 6 meses: segundo aviso, con formación recomendada', (
  select level||'/'||(recommended_action <> '')::text from kiru_methodology_warnings where review_id = pg_temp.r('r2')), '2/true');
select pg_temp.as_user('C');
select public.kiru_methodology_warning_create(pg_temp.i('M'), 'organizacion', 'Sigue sin aplicar el criterio');
select public.kiru_methodology_warning_create(pg_temp.i('M'), 'organizacion', 'Otra vez');
select public.kiru_methodology_warning_create(pg_temp.i('M'), 'estudios', 'Otra competencia');
reset role;
select pg_temp.expect('tercer y cuarto aviso se quedan en nivel 3', (select count(*) from kiru_methodology_warnings where mentor_id = pg_temp.i('M') and competencia = 'organizacion' and level = 3), 2);
select pg_temp.expect('otra competencia empieza en 1', (select level from kiru_methodology_warnings where mentor_id = pg_temp.i('M') and competencia = 'estudios'), 1);
-- Aviso de hace 7 meses a M2: ya no cuenta, pero sigue en el historial.
insert into kiru_methodology_warnings(mentor_id, competencia, origin, level, criterion, created_at)
values (pg_temp.i('M2'), 'bienestar', 'manual', 1, 'Antiguo', now() - interval '7 months');
select pg_temp.as_user('C2');
select pg_temp.expect('pasados 6 meses vuelve a ser primer aviso', (public.kiru_methodology_warning_next_level(pg_temp.i('M2'), 'bienestar') ->> 'level')::int, 1);
select public.kiru_methodology_warning_create(pg_temp.i('M2'), 'bienestar', 'Nuevo');
select pg_temp.expect('y el antiguo sigue en el historial', (select count(*) from kiru_methodology_warnings where mentor_id = pg_temp.i('M2')), 2);
select pg_temp.expect_denied('un coordinador no crea avisos a mentores de otro', format($q$select public.kiru_methodology_warning_create(%L,'organizacion','x')$q$, pg_temp.i('M')));
reset role;
select pg_temp.expect('el nuevo de M2 es nivel 1', (select level from kiru_methodology_warnings where mentor_id = pg_temp.i('M2') and criterion = 'Nuevo'), 1);

-- 7. Seguimiento del aviso -------------------------------------------------------------------
select pg_temp.as_user('C');
select public.kiru_methodology_warning_update((select id from kiru_methodology_warnings where review_id = pg_temp.r('r2')), 'programar_reunion', jsonb_build_object('at', now() + interval '2 days'));
select public.kiru_methodology_warning_update((select id from kiru_methodology_warnings where review_id = pg_temp.r('r2')), 'reunion_realizada', '{"note":"Repasados ejemplos"}');
select public.kiru_methodology_warning_update((select id from kiru_methodology_warnings where review_id = pg_temp.r('r2')), 'mejora', '{"note":"Ya justifica sus notas"}');
select public.kiru_methodology_warning_update((select id from kiru_methodology_warnings where review_id = pg_temp.r('r2')), 'resolver', '{"note":"Resuelto"}');
select pg_temp.expect_denied('un aviso resuelto no se reabre por error', format($q$select public.kiru_methodology_warning_update(%L,'en_revision')$q$, (select id from kiru_methodology_warnings where review_id = pg_temp.r('r2'))));
reset role;
select pg_temp.expect_text('queda con reunión, mejora y resuelto', (
  select (meeting_done_at is not null)::text||'/'||(improvement_at is not null)::text||'/'||status from kiru_methodology_warnings where review_id = pg_temp.r('r2')), 'true/true/resuelto');
select pg_temp.expect('el mentor recibe aviso de la reunión con correo', (select count(*) from kiru_notifications where recipient_id = pg_temp.i('M') and kind = 'aviso_seguimiento' and email_status = 'pendiente'), 1);
select pg_temp.expect('cada paso queda en el historial', (select count(*) from kiru_supervision_events where warning_id = (select id from kiru_methodology_warnings where review_id = pg_temp.r('r2'))), 5);
select pg_temp.as_user('C2');
select pg_temp.expect_denied('otro coordinador no cambia el aviso', format($q$select public.kiru_methodology_warning_update(%L,'en_revision')$q$, (select id from kiru_methodology_warnings where competencia = 'estudios' and mentor_id = pg_temp.i('M'))));
reset role;

-- 8. Resultado A y recordatorios -------------------------------------------------------------
select pg_temp.as_user('C');
insert into rv values ('r3', public.kiru_request_sc_review(pg_temp.log('s1-w3'), 'compromiso', 'otro', 'Revisión rutinaria', '¿Algún ejemplo?'));
insert into rv values ('r4', public.kiru_request_sc_review(pg_temp.log('s1-w4'), 'bienestar', 'otro', 'Revisión rutinaria', '¿Algún ejemplo?'));
reset role;
update kiru_skillcoin_reviews set status_since = now() - interval '4 days' where id = pg_temp.r('r3');
select public.kiru_supervision_tarea_diaria();
select public.kiru_supervision_tarea_diaria();
select pg_temp.expect('recordatorio al mentor una sola vez', (select count(*) from kiru_notifications where kind = 'justificacion_recordatorio' and review_id = pg_temp.r('r3')), 1);
select pg_temp.as_user('C');
select pg_temp.expect_denied('el plazo no puede ser pasado', format($q$select public.kiru_request_sc_review(%L,'estudios','otro','x','y', current_date - 1)$q$, pg_temp.log('s1-w2')));
insert into rv values ('r5', public.kiru_request_sc_review(pg_temp.log('s1-w2'), 'estudios', 'otro', 'Con plazo', '¿Ejemplo?', current_date + 1));
reset role;
select pg_temp.expect('con plazo mañana, se recuerda hoy aunque sea nueva', (select count(*) from kiru_notifications where review_id = pg_temp.r('r5') and kind = 'justificacion_solicitada' and body like '%Plazo para responder%'), 1);
select public.kiru_supervision_tarea_diaria();
select pg_temp.expect('recordatorio por plazo una vez', (select count(*) from kiru_notifications where kind = 'justificacion_recordatorio' and review_id = pg_temp.r('r5')), 1);
select pg_temp.expect('la recién creada no recuerda nada', (select count(*) from kiru_notifications where kind = 'justificacion_recordatorio' and review_id = pg_temp.r('r4')), 0);
select pg_temp.as_user('M');
select public.kiru_answer_sc_review(pg_temp.r('r3'), 'Trajo los deberes hechos toda la semana');
reset role;
update kiru_skillcoin_reviews set status_since = now() - interval '6 days' where id = pg_temp.r('r3');
select public.kiru_supervision_tarea_diaria();
select public.kiru_supervision_tarea_diaria();
select pg_temp.expect('recordatorio al coordinador una sola vez', (select count(*) from kiru_notifications where kind = 'justificacion_por_valorar' and recipient_id = pg_temp.i('C')), 1);
select pg_temp.as_user('C');
select public.kiru_resolve_sc_review(pg_temp.r('r3'), 'adecuada', 'Bien justificado');
select pg_temp.expect_denied('retirar exige motivo', format($q$select public.kiru_resolve_sc_review(%L,'retirada')$q$, pg_temp.r('r4')));
select public.kiru_resolve_sc_review(pg_temp.r('r4'), 'retirada', 'Pedida por error');
reset role;
select pg_temp.expect('A no genera aviso', (select count(*) from kiru_methodology_warnings where review_id = pg_temp.r('r3')), 0);
select pg_temp.expect('al cerrar con A, aviso en la campanita sin correo', (
  select count(*) from kiru_notifications where review_id = pg_temp.r('r3') and kind = 'justificacion_cerrada' and email_status = 'no_aplica'), 1);

-- 9. Las SkillCoins no cambian; corregir es solo de administración ---------------------------
select pg_temp.expect('nada de esto ha cambiado las SkillCoins', (
  select count(*) from before_sc b where b.earned = kiru_private.skillcoins_earned(pg_temp.i('S1'))
    and b.weeks = (select jsonb_agg(w order by w.week) from kiru_private.skillcoin_weeks(pg_temp.i('S1')) w)), 1);
select pg_temp.expect('ni los registros de sesión', (select count(*) from kiru_session_logs where updated_at <> created_at), 0);
select pg_temp.as_user('C');
select pg_temp.expect_denied('un coordinador no corrige notas', format($q$select public.kiru_sc_review_correct(%L, 6, 'x')$q$, pg_temp.r('r1')));
reset role;
select pg_temp.as_user('A');
select public.kiru_sc_review_correct(pg_temp.r('r1'), 6, 'Acordado tras la revisión');
select pg_temp.expect('administración ve todas las revisiones', (select count(*) from kiru_skillcoin_reviews), 5);
reset role;
select pg_temp.expect_text('la corrección queda enlazada y guarda la nota anterior', (
  select organizacion||'/'||(previous->>'organizacion')||'/'||(review_id = pg_temp.r('r1'))::text from kiru_skillcoin_corrections where student_id = pg_temp.i('S1')), '6/10/true');
select pg_temp.expect_text('la nota original de la revisión se conserva', (select score_snapshot::text from kiru_skillcoin_reviews where id = pg_temp.r('r1')), '10');
select pg_temp.expect_denied('el historial no se modifica', $$update kiru_supervision_events set action = 'x'$$);

-- 10. Evidencias: se eliminan al acabar el curso (31 de agosto), el texto se queda ---------
insert into kiru_skillcoin_review_messages(id, review_id, round, author_role, kind, body, created_at)
values ('00000000-0000-0000-0000-0000000000e1', pg_temp.r('r3'), 1, 'mentor', 'respuesta', 'Respuesta del curso pasado', '2026-05-01'),
       ('00000000-0000-0000-0000-0000000000e2', (select id from kiru_skillcoin_reviews where status <> 'cerrada' order by created_at limit 1), 1, 'mentor', 'respuesta', 'Sigue abierta', '2026-05-01');
insert into kiru_skillcoin_review_files(id, review_id, message_id, storage_path, file_name, mime_type, size_bytes, created_at)
values ('00000000-0000-0000-0000-0000000000f1', pg_temp.r('r3'), '00000000-0000-0000-0000-0000000000e1', 'viejo/cerrada.jpg', 'cerrada.jpg', 'image/jpeg', 100, '2026-05-01'),
       ('00000000-0000-0000-0000-0000000000f2', (select review_id from kiru_skillcoin_review_messages where id = '00000000-0000-0000-0000-0000000000e2'),
        '00000000-0000-0000-0000-0000000000e2', 'viejo/abierta.jpg', 'abierta.jpg', 'image/jpeg', 100, '2026-05-01');
select pg_temp.expect_text('el curso empieza el 1 de septiembre', (select kiru_private.course_start('2026-08-31')::text || ' ' || kiru_private.course_start('2026-09-01')::text), '2025-09-01 2026-09-01');
select pg_temp.expect_text('solo caducan archivos de cursos anteriores en revisiones cerradas', (select string_agg(storage_path, ',') from public.kiru_evidence_expired()), 'viejo/cerrada.jpg');
select pg_temp.as_user('C');
select pg_temp.expect_denied('un coordinador no lista archivos para borrar', $$select * from public.kiru_evidence_expired()$$);
select pg_temp.expect_denied('ni los marca como eliminados', $$select public.kiru_evidence_mark_deleted(array['00000000-0000-0000-0000-0000000000f1'::uuid])$$);
reset role;
select pg_temp.expect('se marcan solo los caducados', public.kiru_evidence_mark_deleted(array['00000000-0000-0000-0000-0000000000f1'::uuid, '00000000-0000-0000-0000-0000000000f2'::uuid, pg_temp.r('r1')]), 1);
select pg_temp.expect('repetirlo no cambia nada', public.kiru_evidence_mark_deleted(array['00000000-0000-0000-0000-0000000000f1'::uuid]), 0);
select pg_temp.expect('la fila del archivo se conserva con su fecha de eliminación', (select count(*) from kiru_skillcoin_review_files where deleted_at is not null and deleted_reason = 'fin_de_curso'), 1);
select pg_temp.expect('el texto de la respuesta se conserva', (select count(*) from kiru_skillcoin_review_messages where id = '00000000-0000-0000-0000-0000000000e1'), 1);
select pg_temp.expect('queda en el historial', (select count(*) from kiru_supervision_events where action = 'evidencias_eliminadas' and review_id = pg_temp.r('r3')), 1);
select pg_temp.expect('ya no vuelve a salir para borrar', (select count(*) from public.kiru_evidence_expired()), 0);
select pg_temp.expect_denied('un adjunto no se borra', $$delete from kiru_skillcoin_review_files where id = '00000000-0000-0000-0000-0000000000f2'$$);
select pg_temp.expect_denied('ni se edita su nombre', $$update kiru_skillcoin_review_files set file_name = 'x.jpg' where id = '00000000-0000-0000-0000-0000000000f2'$$);
select pg_temp.expect_denied('ni se «desmarca»', $$update kiru_skillcoin_review_files set deleted_at = null where id = '00000000-0000-0000-0000-0000000000f1'$$);

rollback;
