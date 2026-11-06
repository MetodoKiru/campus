-- Pruebas de clases con fecha: estados, 48 h, recuperaciones, pagos (quién la
-- imparte), días sin clase de Kiru, pausa y permisos por rol. Todo ocurre dentro
-- de una transacción que se deshace al final; no deja datos.
\set ON_ERROR_STOP 1
begin;
create temp table ids(k text primary key, id uuid);
insert into ids values ('A',gen_random_uuid()),('M',gen_random_uuid()),('M2',gen_random_uuid()),('P',gen_random_uuid()),
  ('P2',gen_random_uuid()),('S1',gen_random_uuid()),('S2',gen_random_uuid()),('C',gen_random_uuid()),('C2',gen_random_uuid());
grant select on ids to authenticated, service_role;
insert into auth.users(id,email,raw_app_meta_data) select id, k||'@t', jsonb_build_object('kiru_role', case k
  when 'A' then 'admin' when 'M' then 'mentor' when 'M2' then 'mentor' when 'P' then 'padre' when 'P2' then 'padre'
  when 'C' then 'coordinador' when 'C2' then 'coordinador' else 'alumno' end) from ids;
create function pg_temp.i(k text) returns uuid language sql stable as $$ select id from ids where ids.k = i.k $$;
insert into student_mentors values (pg_temp.i('S1'),pg_temp.i('M')),(pg_temp.i('S2'),pg_temp.i('M2'));
insert into student_guardians(student_id,guardian_id) values (pg_temp.i('S1'),pg_temp.i('P')),(pg_temp.i('S2'),pg_temp.i('P2'));
insert into kiru_coordinator_mentors(mentor_id,coordinator_id) values (pg_temp.i('M'),pg_temp.i('C')),(pg_temp.i('M2'),pg_temp.i('C2'));
insert into kiru_student_schedule_slots(student_id,mentor_id,weekday,start_time,end_time) values
  (pg_temp.i('S1'),pg_temp.i('M'),1,'18:00','19:00'),
  (pg_temp.i('S1'),pg_temp.i('M'),3,'18:00','19:00'),
  (pg_temp.i('S2'),pg_temp.i('M2'),2,'17:00','18:00');

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
  exception when insufficient_privilege or check_violation or unique_violation or exclusion_violation then
    raise notice 'ok  % (denied)', label; return;
  end;
  raise exception 'FAIL %: statement was allowed', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Fechas de prueba (hora de Madrid). A las 07:00 no hay clases del horario.
create temp table t(k text primary key, v timestamptz);
insert into t select 'd0', ((now() at time zone 'Europe/Madrid')::date)::timestamp at time zone 'Europe/Madrid';
create function pg_temp.at(days int, hhmm text) returns timestamptz language sql stable as $$
  select kiru_private.madrid_ts((now() at time zone 'Europe/Madrid')::date + days, hhmm::time) $$;
create function pg_temp.opt(days int, hhmm text) returns jsonb language sql stable as $$
  select jsonb_build_object('start', pg_temp.at(days, hhmm), 'end', pg_temp.at(days, hhmm) + interval '1 hour') $$;
create temp table sess(k text primary key, id uuid);
grant select on t, sess to authenticated;

-- 1. Generación ----------------------------------------------------------------
select pg_temp.expect('genera las clases de 4 semanas de S1', (
  select (public.kiru_clases_generar()->>'creadas')::int), (
  select count(*) from generate_series((now() at time zone 'Europe/Madrid')::date, (now() at time zone 'Europe/Madrid')::date + 28, interval '1 day') d
  where extract(isodow from d) in (1,3)) + (
  select count(*) from generate_series((now() at time zone 'Europe/Madrid')::date, (now() at time zone 'Europe/Madrid')::date + 28, interval '1 day') d
  where extract(isodow from d) = 2));
select pg_temp.expect('volver a generar no duplica', (select (public.kiru_clases_generar()->>'creadas')::int), 0);

-- 2. Pausa desde «Familias» -------------------------------------------------------
select pg_temp.expect('Familias pone a S2 en pausa', (select (public.kiru_familias_estado(jsonb_build_array(
  jsonb_build_object('campus_id', pg_temp.i('S2'), 'estado', 'Pausa · pendiente de continuidad', 'municipio', 'Madrid'),
  jsonb_build_object('campus_id', 'no-es-un-id', 'estado', 'Activa'))) ->> 'actualizados')::int), 1);
select pg_temp.expect('S2 en pausa no tiene clases futuras', (select count(*) from kiru_class_sessions
  where student_id = pg_temp.i('S2') and delivery = 'programada' and scheduled_start > now()), 0);
select pg_temp.expect('las clases de la pausa se anulan, no se borran ni consumen', ((select count(*) from kiru_class_sessions
  where student_id = pg_temp.i('S2') and delivery = 'anulada' and cancel_cause = 'pausa_servicio' and consumption = 'no_aplica') > 0)::int, 1);
select pg_temp.expect('la pausa no llega a la hoja «Sin clase»', (select count(*) from kiru_sheet_outbox where payload->>'alumno' = (select full_name from profiles where id = pg_temp.i('S2'))), 0);
select pg_temp.as_user('A');
select pg_temp.expect_denied('ni admin cambia el estado a mano (manda «Familias»)', format($q$update students set service_status='activo' where profile_id=%L$q$, pg_temp.i('S2')));
reset role;

-- 3. Clases de prueba a horas controladas -------------------------------------------
insert into kiru_class_sessions(student_id, mentor_id, original_start, scheduled_start, scheduled_end, source)
select pg_temp.i('S1'), pg_temp.i('M'), v, v, v + interval '1 hour', 'coordinacion' from (values
  (pg_temp.at(1,'07:00')), (pg_temp.at(1,'09:00')), (pg_temp.at(5,'07:00')), (pg_temp.at(5,'09:00'))) x(v);
insert into sess select 'tarde_familia', id from kiru_class_sessions where scheduled_start = pg_temp.at(1,'07:00');
insert into sess select 'tarde_mentor', id from kiru_class_sessions where scheduled_start = pg_temp.at(1,'09:00');
insert into sess select 'pronto_cambio', id from kiru_class_sessions where scheduled_start = pg_temp.at(5,'07:00');
insert into sess select 'pronto_familia', id from kiru_class_sessions where scheduled_start = pg_temp.at(5,'09:00');
create function pg_temp.s(k text) returns uuid language sql stable as $$ select id from sess where sess.k = s.k $$;
grant execute on function pg_temp.s(text) to authenticated;

select pg_temp.expect_denied('no se puede dar dos clases a la vez', format($q$insert into kiru_class_sessions(student_id, mentor_id, original_start, scheduled_start, scheduled_end, source)
  values (%L, %L, %L, %L, %L, 'coordinacion')$q$, pg_temp.i('S2'), pg_temp.i('M'), pg_temp.at(1,'07:30'), pg_temp.at(1,'07:30'), pg_temp.at(1,'08:30')));

-- 4. Solicitudes y permisos --------------------------------------------------------
select pg_temp.as_user('P');
select pg_temp.expect_denied('la familia no llama a las funciones directamente', format($q$select public.kiru_clases_solicitar(%L, %L, 'cancelacion', 'enfermo')$q$, pg_temp.i('P'), pg_temp.s('tarde_familia')));
reset role;
select pg_temp.expect_denied('otra familia no puede cancelar clases de S1', format($q$select public.kiru_clases_solicitar(%L, %L, 'cancelacion', 'enfermo')$q$, pg_temp.i('P2'), pg_temp.s('tarde_familia')));
select pg_temp.expect_denied('otro mentor no puede pedir cambios de S1', format($q$select public.kiru_clases_solicitar(%L, %L, 'cancelacion', 'no puedo')$q$, pg_temp.i('M2'), pg_temp.s('tarde_familia')));
create temp table req(k text primary key, id uuid);
grant select on req to authenticated;
insert into req select 'fam_tarde', (public.kiru_clases_solicitar(pg_temp.i('P'), pg_temp.s('tarde_familia'), 'cancelacion', 'Está enfermo')->>'id')::uuid;
insert into req select 'men_tarde', (public.kiru_clases_solicitar(pg_temp.i('M'), pg_temp.s('tarde_mentor'), 'cancelacion', 'Accidente de tren')->>'id')::uuid;
insert into req select 'men_cambio', (public.kiru_clases_solicitar(pg_temp.i('M'), pg_temp.s('pronto_cambio'), 'cambio', 'Tengo examen', jsonb_build_array(pg_temp.opt(6,'07:00')))->>'id')::uuid;
insert into req select 'fam_pronto', (public.kiru_clases_solicitar(pg_temp.i('P'), pg_temp.s('pronto_familia'), 'cancelacion', 'Viaje familiar')->>'id')::uuid;
create function pg_temp.r(k text) returns uuid language sql stable as $$ select id from req where req.k = r.k $$;
grant execute on function pg_temp.r(text) to authenticated;
select pg_temp.expect('cancelación de la familia con menos de 48 h queda marcada como tardía', (select count(*) from kiru_class_requests where id = pg_temp.r('fam_tarde') and late and incident = 'ninguna'), 1);
select pg_temp.expect('cancelación tardía del mentor abre incidencia potencial (no sanción)', (select count(*) from kiru_class_requests where id = pg_temp.r('men_tarde') and late and incident = 'potencial'), 1);
select pg_temp.expect('cambio con aviso del mentor no abre incidencia', (select count(*) from kiru_class_requests where id = pg_temp.r('men_cambio') and not late and incident = 'ninguna'), 1);
select pg_temp.expect_denied('una sola solicitud abierta por clase', format($q$select public.kiru_clases_solicitar(%L, %L, 'cancelacion', 'otra vez')$q$, pg_temp.i('P'), pg_temp.s('tarde_familia')));
select pg_temp.expect_denied('el mentor tiene que proponer fecha para un cambio', format($q$select public.kiru_clases_solicitar(%L, %L, 'cambio', 'sin fecha')$q$, pg_temp.i('M'), pg_temp.s('pronto_familia')));
select pg_temp.expect_denied('no se propone un hueco ocupado', format($q$select public.kiru_clases_solicitar(%L, %L, 'cambio', 'choca', %L::jsonb)$q$, pg_temp.i('P'), pg_temp.s('tarde_mentor'), jsonb_build_array(pg_temp.opt(1,'07:00'))));
select pg_temp.expect('el coordinador recibe aviso de cada solicitud', (select count(*) from kiru_notifications where recipient_id = pg_temp.i('C') and kind = 'clase_solicitud'), 4);
select pg_temp.expect('el coordinador de otro grupo no recibe nada', (select count(*) from kiru_notifications where recipient_id = pg_temp.i('C2')), 0);

-- Lo que ve cada uno
select pg_temp.as_user('C');
select pg_temp.expect('coordinador ve las solicitudes de su mentor', (select count(*) from kiru_class_requests), 4);
reset role;
select pg_temp.as_user('C2');
select pg_temp.expect('otro coordinador no ve clases de S1', (select count(*) from kiru_class_sessions where student_id = pg_temp.i('S1')), 0);
select pg_temp.expect('otro coordinador no ve solicitudes de S1', (select count(*) from kiru_class_requests where student_id = pg_temp.i('S1')), 0);
reset role;
select pg_temp.as_user('P');
select pg_temp.expect('la familia no lee la tabla interna de clases', (select count(*) from kiru_class_sessions), 0);
select pg_temp.expect('la familia no lee la tabla interna de solicitudes', (select count(*) from kiru_class_requests), 0);
select pg_temp.expect('la familia ve sus dos solicitudes, no las del mentor sin resolver', (select count(*) from kiru_family_class_requests), 2);
select pg_temp.expect('la familia no ve clases de otros alumnos', (select count(*) from kiru_family_classes where student_id <> pg_temp.i('S1')), 0);
reset role;
select pg_temp.as_user('P2');
select pg_temp.expect('P2 (S2 en pausa) no ve clases anuladas', (select count(*) from kiru_family_classes), 0);
reset role;

-- 5. Decisiones de coordinación --------------------------------------------------
select pg_temp.expect_denied('otro coordinador no decide', format($q$select public.kiru_clases_decidir(%L, %L, 'aprobar_cancelacion')$q$, pg_temp.i('C2'), pg_temp.r('fam_tarde')));
select pg_temp.expect_denied('el mentor no decide', format($q$select public.kiru_clases_decidir(%L, %L, 'aprobar_cancelacion')$q$, pg_temp.i('M'), pg_temp.r('fam_tarde')));
select public.kiru_clases_decidir(pg_temp.i('C'), pg_temp.r('fam_tarde'), 'aprobar_cancelacion', 'De acuerdo');
select public.kiru_clases_decidir(pg_temp.i('C'), pg_temp.r('men_tarde'), 'aprobar_cancelacion', 'Paula propondrá fechas');
select public.kiru_clases_decidir(pg_temp.i('C'), pg_temp.r('men_cambio'), 'aprobar', '', 0);
select public.kiru_clases_decidir(pg_temp.i('C'), pg_temp.r('fam_pronto'), 'aprobar_cancelacion', '');

select pg_temp.expect_text('familia <48 h: consumida, sin recuperación', (select delivery||'/'||consumption||'/'||recovery||'/'||cancel_cause from kiru_class_sessions where id = pg_temp.s('tarde_familia')), 'no_impartida/consumida/ninguna/familia_menos_48h');
select pg_temp.expect_text('cancela el mentor: la familia conserva y queda por recuperar', (select delivery||'/'||consumption||'/'||recovery||'/'||cancel_cause from kiru_class_sessions where id = pg_temp.s('tarde_mentor')), 'no_impartida/conservada/pendiente/mentor');
select pg_temp.expect_text('familia con aviso: conserva con derecho a recuperar', (select consumption||'/'||recovery||'/'||cancel_cause from kiru_class_sessions where id = pg_temp.s('pronto_familia')), 'conservada/pendiente/familia_con_aviso');
select pg_temp.expect('cambio aprobado: la misma clase se mueve (no se crea otra)', (select count(*) from kiru_class_sessions where id = pg_temp.s('pronto_cambio') and scheduled_start = pg_temp.at(6,'07:00') and original_start = pg_temp.at(5,'07:00') and delivery = 'programada'), 1);
select pg_temp.expect('el cambio queda en el historial', (select count(*) from kiru_class_events where session_id = pg_temp.s('pronto_cambio') and action = 'reprogramada'), 1);
select pg_temp.expect('las cancelaciones van a «Sin clase» con su id de clase', (select count(*) from kiru_sheet_outbox where target = 'sin_clase' and row_key in (pg_temp.s('tarde_familia')::text, pg_temp.s('tarde_mentor')::text, pg_temp.s('pronto_familia')::text)), 3);
select pg_temp.expect_text('«Quién cancela» con la etiqueta acordada', (select payload->>'quien_cancela' from kiru_sheet_outbox where row_key = pg_temp.s('tarde_familia')::text), 'Familia, menos de 48 h');
select pg_temp.expect('recuperación nueva avisa al coordinador y al mentor', (select count(*) from kiru_notifications where kind = 'recuperacion_nueva' and session_id = pg_temp.s('tarde_mentor') and recipient_id in (pg_temp.i('C'), pg_temp.i('M'))), 2);
select pg_temp.expect('la familia se entera de la decisión', (select count(*) from kiru_notifications where kind = 'clase_decision' and recipient_id = pg_temp.i('P')), 4);
select pg_temp.as_user('P');
select pg_temp.expect('el motivo interno del mentor no llega a la familia', (select count(*) from kiru_family_class_requests where requester_role = 'mentor' and reason <> ''), 0);
reset role;
select pg_temp.expect_denied('una solicitud resuelta no se vuelve a decidir', format($q$select public.kiru_clases_decidir(%L, %L, 'rechazar')$q$, pg_temp.i('C'), pg_temp.r('fam_tarde')));

-- 6. Recuperaciones ------------------------------------------------------------
select pg_temp.expect_denied('la familia no propone fechas de recuperación', format($q$select public.kiru_recuperaciones_proponer(%L, %L, %L::jsonb)$q$, pg_temp.i('P'), pg_temp.s('tarde_mentor'), jsonb_build_array(pg_temp.opt(8,'07:00'))));
select pg_temp.expect_denied('no se recupera una clase que sigue programada', format($q$select public.kiru_recuperaciones_proponer(%L, %L, %L::jsonb)$q$, pg_temp.i('M'), pg_temp.s('pronto_cambio'), jsonb_build_array(pg_temp.opt(8,'07:00'))));
insert into req select 'prop1', (public.kiru_recuperaciones_proponer(pg_temp.i('M'), pg_temp.s('tarde_mentor'), jsonb_build_array(pg_temp.opt(8,'07:00'), pg_temp.opt(9,'07:00')), 'Te propongo estas')->>'id')::uuid;
select pg_temp.expect('la familia recibe las opciones', (select count(*) from kiru_notifications where kind = 'recuperacion_propuesta' and recipient_id = pg_temp.i('P')), 1);
-- «Ninguna me encaja» → coordinación
select public.kiru_recuperaciones_elegir(pg_temp.i('P'), pg_temp.r('prop1'), null, 'Esas tardes no podemos');
select pg_temp.expect_text('ninguna encaja: queda para coordinación', (select recovery from kiru_class_sessions where id = pg_temp.s('tarde_mentor')), 'sin_encaje');
select pg_temp.expect('coordinación recibe el «no encaja»', (select count(*) from kiru_notifications where kind = 'recuperacion_sin_encaje' and recipient_id = pg_temp.i('C')), 1);
insert into req select 'prop2', (public.kiru_recuperaciones_proponer(pg_temp.i('C'), pg_temp.s('tarde_mentor'), jsonb_build_array(pg_temp.opt(9,'07:00'), pg_temp.opt(10,'07:00')))->>'id')::uuid;
-- Mientras tanto alguien ocupa la primera opción: el servidor vuelve a comprobar.
insert into kiru_class_sessions(student_id, mentor_id, original_start, scheduled_start, scheduled_end, source)
values (pg_temp.i('S1'), pg_temp.i('M'), pg_temp.at(9,'07:30'), pg_temp.at(9,'07:30'), pg_temp.at(9,'08:00'), 'coordinacion');
select pg_temp.expect_denied('al elegir se revalida que el hueco siga libre', format($q$select public.kiru_recuperaciones_elegir(%L, %L, 0)$q$, pg_temp.i('P'), pg_temp.r('prop2')));
select pg_temp.expect_denied('otra familia no elige', format($q$select public.kiru_recuperaciones_elegir(%L, %L, 1)$q$, pg_temp.i('P2'), pg_temp.r('prop2')));
insert into sess select 'recup1', (public.kiru_recuperaciones_elegir(pg_temp.i('P'), pg_temp.r('prop2'), 1)->>'recuperacion')::uuid;
select pg_temp.expect_text('recuperación confirmada y enlazada a la original', (select kind||'/'||consumption||'/'||delivery from kiru_class_sessions where id = pg_temp.s('recup1') and recovers_session_id = pg_temp.s('tarde_mentor')), 'recuperacion/no_aplica/programada');
select pg_temp.expect_text('la original pasa a «programada»', (select recovery from kiru_class_sessions where id = pg_temp.s('tarde_mentor')), 'programada');
select pg_temp.expect_text('se copia a «Recuperaciones» al confirmarse', (select payload->>'fecha_recuperacion' from kiru_sheet_outbox where target = 'recuperaciones' and row_key = pg_temp.s('recup1')::text), to_char(pg_temp.at(10,'07:00') at time zone 'Europe/Madrid', 'DD/MM/YYYY'));
select pg_temp.expect('confirmación a mentor, familia y coordinador', (select count(distinct recipient_id) from kiru_notifications where kind = 'recuperacion_confirmada'), 3);
select pg_temp.expect_denied('una original solo tiene una recuperación viva', format($q$insert into kiru_class_sessions(student_id, mentor_id, kind, recovers_session_id, original_start, scheduled_start, scheduled_end, consumption, source) values (%L,%L,'recuperacion',%L,%L,%L,%L,'no_aplica','recuperacion')$q$, pg_temp.i('S1'), pg_temp.i('M'), pg_temp.s('tarde_mentor'), pg_temp.at(12,'07:00'), pg_temp.at(12,'07:00'), pg_temp.at(12,'08:00')));

-- El registro del formulario la marca como impartida y consume la original una vez.
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers)
values ('rec-1', now(), (pg_temp.at(10,'07:00') at time zone 'Europe/Madrid')::date, 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]');
select pg_temp.expect_text('el registro marca impartida y cobra quien firma', (select delivery||'/'||(delivered_by = pg_temp.i('M'))::text from kiru_class_sessions where id = pg_temp.s('recup1')), 'impartida/true');
select pg_temp.expect_text('la original queda recuperada y consumida', (select recovery||'/'||consumption from kiru_class_sessions where id = pg_temp.s('tarde_mentor')), 'realizada/consumida');

-- Recuperación voluntaria de una clase consumida (familia <48 h): la da un sustituto.
-- Se usa un jueves o viernes (sin clases del horario) para probar el duplicado.
create temp table vd as select min(n) as n from generate_series(11, 20) n
  where extract(isodow from (now() at time zone 'Europe/Madrid')::date + n) in (4, 5);
insert into req select 'vol', (public.kiru_recuperaciones_proponer(pg_temp.i('M'), pg_temp.s('tarde_familia'), jsonb_build_array(pg_temp.opt((select n from vd),'07:00')))->>'id')::uuid;
insert into sess select 'recup_vol', (public.kiru_recuperaciones_elegir(pg_temp.i('P'), pg_temp.r('vol'), 0)->>'recuperacion')::uuid;
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers)
values ('rec-2', now(), (pg_temp.at((select n from vd),'07:00') at time zone 'Europe/Madrid')::date, 'M2', 'S1', pg_temp.i('M2'), pg_temp.i('S1'), '[]');
select pg_temp.expect('la voluntaria la cobra el sustituto que la imparte', (select count(*) from kiru_class_sessions where id = pg_temp.s('recup_vol') and delivered_by = pg_temp.i('M2')), 1);
select pg_temp.expect('y la original no se descuenta otra vez', (select count(*) from kiru_class_sessions where id = pg_temp.s('tarde_familia') and consumption = 'consumida' and delivered_by is null), 1);
select pg_temp.expect('un segundo registro del mismo día no cuenta dos veces', (select count(*) from kiru_class_sessions where id = pg_temp.s('recup_vol') and session_log_id = (select id from kiru_session_logs where source_key = 'rec-2')), 1);
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers)
values ('rec-2-dup', now(), (pg_temp.at((select n from vd),'07:00') at time zone 'Europe/Madrid')::date, 'M2', 'S1', pg_temp.i('M2'), pg_temp.i('S1'), '[]');
select pg_temp.expect('el duplicado queda sin enlazar y marcado como probable duplicado', (select count(*) from kiru_unlinked_session_logs where id = (select id from kiru_session_logs where source_key = 'rec-2-dup') and probable_duplicate), 1);
select pg_temp.as_user('M2');
select pg_temp.expect('el sustituto ve solo la clase que dio', (select count(*) from kiru_class_sessions where student_id = pg_temp.i('S1')), 1);
reset role;

-- 7. Avisos de registros fuera de horario ---------------------------------------
insert into kiru_session_logs(source_key, submitted_at, session_date, mentor_name, student_name, mentor_id, student_id, answers)
values ('fuera', now(), (now() at time zone 'Europe/Madrid')::date - 2, 'M', 'S1', pg_temp.i('M'), pg_temp.i('S1'), '[]');
select pg_temp.expect_denied('solo el mentor que firmó avisa', format($q$select public.kiru_registros_avisar(%L, %L, 'cambio_acordado')$q$, pg_temp.i('M2'), (select id from kiru_session_logs where source_key = 'fuera')));
insert into req select 'aviso', (public.kiru_registros_avisar(pg_temp.i('M'), (select id from kiru_session_logs where source_key = 'fuera'), 'cambio_acordado', 'Lo movimos con la familia')->>'id')::uuid;
select pg_temp.expect('el aviso llega al coordinador del mentor', (select count(*) from kiru_notifications where kind = 'registro_aviso' and recipient_id = pg_temp.i('C')), 1);
select pg_temp.expect_denied('otro coordinador no lo gestiona', format($q$select public.kiru_registros_gestionar_aviso(%L, %L, 'gestionado')$q$, pg_temp.i('C2'), pg_temp.r('aviso')));
select public.kiru_registros_gestionar_aviso(pg_temp.i('C'), pg_temp.r('aviso'), 'mas_info', '¿Qué día era la original?');
select public.kiru_registros_responder_aviso(pg_temp.i('M'), pg_temp.r('aviso'), 'El lunes anterior');
select public.kiru_registros_gestionar_aviso(pg_temp.i('C'), pg_temp.r('aviso'), 'gestionado', 'Correcto');
select pg_temp.expect_text('aviso gestionado sin incidencia automática', (select status||'/'||incident from kiru_class_requests where id = pg_temp.r('aviso')), 'gestionado/ninguna');
select pg_temp.expect('el historial guarda los pasos del aviso', (select count(*) from kiru_class_events where request_id = pg_temp.r('aviso')), 4);
select public.kiru_incidencias_revisar(pg_temp.i('C'), pg_temp.r('men_tarde'), 'justificada', 'Accidente de tren');
select pg_temp.expect_text('la incidencia potencial la valora coordinación', (select incident from kiru_class_requests where id = pg_temp.r('men_tarde')), 'justificada');

-- 8. Días sin clase de Kiru ----------------------------------------------------
create temp table nd as select ((now() at time zone 'Europe/Madrid')::date + ((8 - extract(isodow from (now() at time zone 'Europe/Madrid')::date)::int) % 7) + 7) as day;
select pg_temp.expect_denied('un coordinador no marca días sin clase', format($q$select public.kiru_dias_sin_clase_guardar(%L, %L, 'Puente')$q$, pg_temp.i('C'), (select day from nd)));
select public.kiru_dias_sin_clase_guardar(pg_temp.i('A'), (select day from nd), 'Puente de Kiru');
select pg_temp.expect('el día sin clase anula la clase de ese lunes (sin consumir)', (select count(*) from kiru_class_sessions where student_id = pg_temp.i('S1') and (original_start at time zone 'Europe/Madrid')::date = (select day from nd) and delivery = 'anulada' and cancel_cause = 'dia_sin_clase_kiru' and consumption = 'no_aplica'), 1);
select pg_temp.expect_text('y se copia a «Sin clase» sin mentor ni alumno', (select payload->>'mentor' || '|' || (payload->>'quien_cancela') from kiru_sheet_outbox where row_key = 'dia:' || (select day from nd)::text), '|Día sin clase Kiru');
select pg_temp.expect_denied('no se proponen recuperaciones en un día sin clase', format($q$select public.kiru_recuperaciones_proponer(%L, %L, %L::jsonb)$q$, pg_temp.i('M'), pg_temp.s('pronto_familia'), jsonb_build_array(jsonb_build_object('start', kiru_private.madrid_ts((select day from nd), '07:00'), 'end', kiru_private.madrid_ts((select day from nd), '08:00')))));
select pg_temp.expect('previstas restan el día sin clase de Kiru', (select (public.kiru_sesiones_previstas(pg_temp.i('S1'), (select day from nd), (select day from nd) + 7)->>'previstas')::int), 1);
select pg_temp.expect('previstas en pausa = 0', (select (public.kiru_sesiones_previstas(pg_temp.i('S2'), (select day from nd), (select day from nd) + 7)->>'previstas')::int), 0);
select public.kiru_dias_sin_clase_guardar(pg_temp.i('A'), (select day from nd), '', false);
select pg_temp.expect('sin el día, previstas vuelve a 2', (select (public.kiru_sesiones_previstas(pg_temp.i('S1'), (select day from nd), (select day from nd) + 7)->>'previstas')::int), 2);
select pg_temp.expect('al quitar el día, la clase vuelve', (select count(*) from kiru_class_sessions where student_id = pg_temp.i('S1') and (original_start at time zone 'Europe/Madrid')::date = (select day from nd) and delivery = 'programada'), 1);

-- 9. Resumen del periodo y tarea diaria ----------------------------------------
insert into kiru_payments(student_id, concept, amount_cents, created_by, coverage_start, coverage_end, sessions_included)
values (pg_temp.i('S1'), 'periodo', 100, pg_temp.i('A'), (now() at time zone 'Europe/Madrid')::date, (now() at time zone 'Europe/Madrid')::date + 30, 8);
select pg_temp.as_user('P');
select pg_temp.expect('la familia ve su periodo: 2 consumidas (una tardía y una recuperada)', (select sessions_consumed from kiru_period_session_summary where student_id = pg_temp.i('S1')), 2);
select pg_temp.expect('1 recuperación sigue abierta (la que avisó con tiempo)', (select recoveries_open from kiru_period_session_summary where student_id = pg_temp.i('S1')), 1);
reset role;
select pg_temp.as_user('P2');
select pg_temp.expect('otra familia no ve ese periodo', (select count(*) from kiru_period_session_summary where student_id = pg_temp.i('S1')), 0);
reset role;
update kiru_class_sessions set recovery_status_since = now() - interval '4 days' where id = pg_temp.s('pronto_familia');
select public.kiru_clases_tarea_diaria();
select pg_temp.expect('recuperación parada 3 días: aviso al coordinador del mentor', (select count(*) from kiru_notifications where kind = 'recuperacion_sin_avanzar' and recipient_id = pg_temp.i('C')), 1);
select public.kiru_clases_tarea_diaria();
select pg_temp.expect('el aviso no se repite cada día', (select count(*) from kiru_notifications where kind = 'recuperacion_sin_avanzar'), 1);
select pg_temp.expect_denied('el historial no se modifica', $q$update kiru_class_events set action = 'x'$q$);
rollback;
